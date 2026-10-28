import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "@/models/models";
import {
    FIRST_TOPIC_DEFAULT_TITLE,
    acknowledgeTopicUnreadIndicator,
    canApplyTopicAcknowledgementResult,
    consumePendingTopicScrollRequest,
    canApplyTopicReplyLoad,
    createTopicUnreadIndicator,
    findFirstUnreadReplyId,
    getInitialTopicTitle,
    getMainFeedTopicMessages,
    getTopicIndexMessages,
    getTopicReplyChangeSignals,
    getTopicViewportSnapshot,
    confirmOptimisticTopicReply,
    isTopicViewportNearBottom,
    mergeAuthoritativeTopicReplies,
    mergeRefreshedTopicStarters,
    planTopicReplyLoad,
    selectTopicReplyScrollTarget,
    selectInitialTopicId,
    selectFollowUpTopicReplySignal,
    shouldReconcileTopicReplies,
    shouldScheduleTopicReplyRetry,
    selectOldestUnreadTopicId,
    selectUnreadTopicIds,
    recordTopicUnreadIndicatorBoundary,
    reconcileDeferredTopicOrder,
    resolveTopicUnreadBoundary,
    selectQueuedTopicAcknowledgementBoundary,
    selectTopicAcknowledgementBoundary,
    shouldAcknowledgeTopicInteraction,
    shouldRefreshUnreadAfterReaction,
    KeyedTaskQueue,
    shouldAcknowledgeTopicIndicatorFromDraft,
    shouldAutoScrollTopicReplies,
    shouldRenderTopicFeed,
} from "./chat-topic-utils";

const makeMessage = (id: string, overrides: Partial<ChatMessage> & Record<string, any> = {}): ChatMessage =>
    ({
        id,
        roomId: "conversation-1",
        type: "m.room.message",
        content: { msgtype: "m.text", body: id },
        createdBy: "did:example:sender",
        createdAt: new Date("2026-07-17T10:00:00.000Z"),
        author: { _id: "sender", name: "Sender" },
        reactions: {},
        ...overrides,
    }) as ChatMessage;

const looseMessage = makeMessage("loose-message");
const olderTopic = makeMessage("older-topic", {
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
    thread: {
        title: "Older topic",
        createdAt: new Date("2026-07-17T09:00:00.000Z"),
        updatedAt: new Date("2026-07-17T09:30:00.000Z"),
        replyCount: 1,
    },
});
const activeTopic = makeMessage("active-topic", {
    createdAt: new Date("2026-07-17T08:00:00.000Z"),
    thread: {
        title: "Active topic",
        createdAt: new Date("2026-07-17T08:00:00.000Z"),
        updatedAt: new Date("2026-07-17T11:00:00.000Z"),
        replyCount: 4,
    },
});
const topicReply = makeMessage("topic-reply", {
    threadId: "active-topic",
    createdAt: new Date("2026-07-17T11:05:00.000Z"),
});

assert.deepEqual(
    getTopicReplyChangeSignals([
        topicReply,
        makeMessage("other-topic-reply", { threadId: "older-topic" }),
        makeMessage("latest-active-reply", { threadId: "active-topic" }),
        looseMessage,
    ]),
    {
        "active-topic": "latest-active-reply",
        "older-topic": "other-topic-reply",
    },
    "a poll batch retains the latest change signal for every affected topic",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 2,
        currentRequestId: 2,
        loadScope: 4,
        currentLoadScope: 4,
        isTopicOpen: true,
    }),
    true,
    "the current reply response applies to an open topic",
);

test("keyed reaction tasks preserve click order for one message", async () => {
    const queue = new KeyedTaskQueue();
    const order: string[] = [];
    let reactionPresent = false;
    let releaseAddition!: () => void;
    let confirmAdditionStarted!: () => void;
    const additionGate = new Promise<void>((resolve) => {
        releaseAddition = resolve;
    });
    const additionStarted = new Promise<void>((resolve) => {
        confirmAdditionStarted = resolve;
    });
    const addition = queue.enqueue("message-a", async () => {
        order.push("addition-start");
        confirmAdditionStarted();
        await additionGate;
        reactionPresent = true;
        order.push("addition-finish");
        return "added";
    });
    const removal = queue.enqueue("message-a", async () => {
        reactionPresent = false;
        order.push("removal");
        return "removed";
    });
    await additionStarted;
    assert.deepEqual(order, ["addition-start"]);
    releaseAddition();
    assert.equal(await addition, "added");
    assert.equal(await removal, "removed");
    assert.deepEqual(order, ["addition-start", "addition-finish", "removal"]);
    assert.equal(reactionPresent, false, "the queued removal determines the final reaction state");
});

test("keyed reaction tasks run independently for different messages", async () => {
    const queue = new KeyedTaskQueue();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });
    const first = queue.enqueue("message-a", async () => firstGate);
    const second = queue.enqueue("message-b", async () => "message-b-finished");
    assert.equal(await second, "message-b-finished");
    releaseFirst();
    await first;
});

test("a failed keyed reaction task does not block the next click", async () => {
    const queue = new KeyedTaskQueue();
    const failure = queue.enqueue("message-a", async () => {
        throw new Error("simulated reaction failure");
    });
    const next = queue.enqueue("message-a", async () => "next-finished");
    await assert.rejects(failure, /simulated reaction failure/);
    assert.equal(await next, "next-finished");
});

const topicId = "64a000000000000000000001";
const replyA = "64a000000000000000000002";
const replyB = "64a000000000000000000003";
const replyC = "64a000000000000000000004";
assert.equal(shouldAcknowledgeTopicInteraction("focus"), true, "deliberate pointer or keyboard focus acknowledges");
assert.equal(shouldAcknowledgeTopicInteraction("focus", true), false, "known programmatic focus does not acknowledge");
for (const interaction of ["typing", "emoji", "send", "attachment", "mark-read"] as const) {
    assert.equal(
        shouldAcknowledgeTopicInteraction(interaction),
        true,
        `${interaction} is a deliberate acknowledgement`,
    );
}
for (const interaction of ["scroll", "expand", "close", "navigate", "draft-state"] as const) {
    assert.equal(shouldAcknowledgeTopicInteraction(interaction), false, `${interaction} does not acknowledge`);
}
assert.equal(
    shouldRefreshUnreadAfterReaction({ success: true, reactionAdded: true, readStatePersisted: true }),
    true,
    "a successful reaction addition refreshes unread counts",
);
assert.equal(
    shouldRefreshUnreadAfterReaction({ success: true, reactionAdded: false, readStatePersisted: true }),
    false,
    "reaction removal does not refresh unread counts",
);
assert.equal(
    shouldRefreshUnreadAfterReaction({ success: false, reactionAdded: true, readStatePersisted: true }),
    false,
    "a failed reaction does not refresh unread counts",
);
assert.equal(
    shouldRefreshUnreadAfterReaction({ success: true, reactionAdded: true, readStatePersisted: false }),
    false,
    "a reaction with failed read persistence does not refresh unread counts",
);
assert.equal(
    selectTopicAcknowledgementBoundary({
        topicId,
        topicCreatedAt: new Date("2026-01-01T00:00:00Z"),
        replies: [
            { id: replyA, createdAt: new Date("2026-01-01T00:01:00Z") },
            { id: replyB, createdAt: new Date("2026-01-01T00:02:00Z") },
        ],
        expectedReplyCount: 2,
    }),
    replyB,
    "an interaction freezes the chronologically latest message in the complete loaded topic",
);
assert.equal(
    selectTopicAcknowledgementBoundary({ topicId, replies: [{ id: replyA }], expectedReplyCount: 2 }),
    null,
    "an incomplete loaded reply set fails closed",
);
assert.equal(
    selectTopicAcknowledgementBoundary({
        topicId: "64afffffffffffffffffffff",
        topicCreatedAt: new Date("2026-01-01T00:00:00Z"),
        replies: [{ id: replyA, createdAt: new Date("2026-01-02T00:00:00Z") }],
        expectedReplyCount: 1,
    }),
    replyA,
    "a newer reply with a lower ObjectId is the acknowledgement boundary",
);
assert.deepEqual(
    selectQueuedTopicAcknowledgementBoundary({
        capturedBoundary: replyB,
        inFlightBoundary: null,
        queuedBoundary: null,
        persistedBoundary: null,
    }),
    { shouldStart: true, queuedBoundary: null },
    "the first explicitly captured boundary starts persistence",
);
assert.deepEqual(
    selectQueuedTopicAcknowledgementBoundary({
        capturedBoundary: replyB,
        inFlightBoundary: replyB,
        queuedBoundary: null,
        persistedBoundary: null,
    }),
    { shouldStart: false, queuedBoundary: null },
    "repeated actions at the in-flight boundary do not duplicate writes",
);
assert.deepEqual(
    selectQueuedTopicAcknowledgementBoundary({
        capturedBoundary: replyC,
        inFlightBoundary: replyB,
        queuedBoundary: null,
        persistedBoundary: null,
    }),
    { shouldStart: false, queuedBoundary: replyC },
    "a later deliberate interaction queues its newer frozen boundary",
);
assert.deepEqual(
    selectQueuedTopicAcknowledgementBoundary({
        capturedBoundary: replyB,
        inFlightBoundary: null,
        queuedBoundary: null,
        persistedBoundary: replyB,
    }),
    { shouldStart: false, queuedBoundary: null },
    "an already persisted boundary is not written again while counts refresh",
);
const currentAcknowledgementResult = {
    requestId: 4,
    currentRequestId: 4,
    expectedConversationId: "conversation-1",
    currentConversationId: "conversation-1",
    expectedTopicId: topicId,
    currentTopicId: topicId,
    expectedLoadScope: 7,
    currentLoadScope: 7,
};
assert.equal(
    canApplyTopicAcknowledgementResult(currentAcknowledgementResult),
    true,
    "a successful current acknowledgement may refresh authoritative counts",
);
assert.equal(
    canApplyTopicAcknowledgementResult({
        ...currentAcknowledgementResult,
        currentConversationId: "conversation-2",
    }),
    false,
    "switching conversations invalidates a stale acknowledgement completion",
);
assert.equal(
    canApplyTopicAcknowledgementResult({ ...currentAcknowledgementResult, currentLoadScope: 8 }),
    false,
    "a changed topic load scope invalidates a stale acknowledgement completion",
);
const pendingTopicScroll = { current: true };
assert.equal(
    consumePendingTopicScrollRequest(pendingTopicScroll),
    true,
    "direct navigation consumes its scroll request",
);
assert.equal(pendingTopicScroll.current, false, "direct navigation clears the pending scroll flag immediately");
assert.equal(
    consumePendingTopicScrollRequest(pendingTopicScroll),
    false,
    "a later polling refresh cannot reuse a stale automatic-scroll request",
);
assert.deepEqual(
    selectUnreadTopicIds([activeTopic, olderTopic], { "active-topic": 1, "older-topic": 2 }),
    ["active-topic", "older-topic"],
    "expanded topics remain eligible for Next unread navigation",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 1,
        currentRequestId: 2,
        loadScope: 4,
        currentLoadScope: 4,
        isTopicOpen: true,
    }),
    false,
    "an overlapping stale reply response cannot overwrite newer state",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 2,
        currentRequestId: 2,
        loadScope: 3,
        currentLoadScope: 4,
        isTopicOpen: true,
    }),
    false,
    "a previous-conversation reply response cannot apply after the load scope changes",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 2,
        currentRequestId: 2,
        loadScope: 4,
        currentLoadScope: 4,
        isTopicOpen: false,
    }),
    false,
    "a closed topic cannot apply a reply response or advance its read boundary",
);
assert.deepEqual(
    planTopicReplyLoad({
        isTopicOpen: true,
        isInFlight: true,
        pendingSignal: null,
    }),
    { shouldStart: false, pendingSignal: null },
    "an overlapping initial load does not start a duplicate fetch",
);
assert.deepEqual(
    planTopicReplyLoad({
        isTopicOpen: true,
        isInFlight: true,
        pendingSignal: null,
        requestedSignal: "reply-3",
    }),
    { shouldStart: false, pendingSignal: "reply-3" },
    "a live reply signal is retained while a request is in flight",
);
assert.deepEqual(
    planTopicReplyLoad({
        isTopicOpen: true,
        isInFlight: false,
        pendingSignal: "reply-3",
    }),
    { shouldStart: true, activeSignal: "reply-3", pendingSignal: null },
    "the queued live reply signal is consumed by the follow-up load",
);
assert.equal(
    selectFollowUpTopicReplySignal({
        pendingSignal: "reply-3",
        appliedSignal: "reply-2",
        isTopicOpen: true,
    }),
    "reply-3",
    "the newest queued signal schedules one follow-up after an in-flight load",
);
assert.equal(
    selectFollowUpTopicReplySignal({
        pendingSignal: "reply-3",
        appliedSignal: "reply-2",
        isTopicOpen: false,
    }),
    undefined,
    "closing a topic suppresses its queued background refresh",
);
assert.equal(
    selectFollowUpTopicReplySignal({
        pendingSignal: "reply-3",
        appliedSignal: "reply-3",
        isTopicOpen: true,
    }),
    undefined,
    "an already-applied signal does not cause a duplicate reply load",
);
assert.equal(
    shouldReconcileTopicReplies({ isTopicOpen: true, expectedReplyCount: 3, loadedReplyCount: 1 }),
    true,
    "an expanded topic reconciles when authoritative replies are missing",
);
assert.equal(
    shouldReconcileTopicReplies({ isTopicOpen: false, expectedReplyCount: 3, loadedReplyCount: 1 }),
    false,
    "a collapsed topic does not fetch replies in the background",
);
assert.equal(
    shouldReconcileTopicReplies({ isTopicOpen: true, expectedReplyCount: 2, loadedReplyCount: 2 }),
    false,
    "a complete topic does not schedule a duplicate reply fetch",
);
assert.deepEqual(
    planTopicReplyLoad({
        isTopicOpen: true,
        isInFlight: true,
        pendingSignal: "incoming-reply",
        requestedSignal: "own-reply",
    }),
    { shouldStart: false, pendingSignal: "own-reply" },
    "an own reply sent during an active incoming refresh schedules the follow-up load",
);
assert.equal(
    shouldScheduleTopicReplyRetry({
        signal: "reply-count:3",
        lastRetriedSignal: null,
        isTopicOpen: true,
        loadScope: 2,
        currentLoadScope: 2,
    }),
    true,
    "a failed expanded-topic reconciliation remains retryable once",
);
assert.equal(
    shouldScheduleTopicReplyRetry({
        signal: "reply-count:3",
        lastRetriedSignal: "reply-count:3",
        isTopicOpen: true,
        loadScope: 2,
        currentLoadScope: 2,
    }),
    false,
    "the same failed reconciliation cannot create an infinite retry loop",
);
assert.equal(
    shouldScheduleTopicReplyRetry({
        signal: "reply-count:3",
        lastRetriedSignal: null,
        isTopicOpen: true,
        loadScope: 2,
        currentLoadScope: 3,
    }),
    false,
    "a failed request from the previous conversation cannot schedule a retry",
);

assert.deepEqual(
    getTopicIndexMessages([looseMessage, olderTopic, activeTopic, topicReply]).map((message) => message.id),
    ["active-topic", "older-topic"],
    "topic index contains only topic starters ordered by original topic creation ascending",
);
assert.deepEqual(
    getTopicViewportSnapshot([activeTopic, olderTopic]),
    getTopicViewportSnapshot([
        activeTopic,
        topicReply,
        olderTopic,
        makeMessage("new-reply", { threadId: "older-topic" }),
    ]),
    "incoming replies do not look like new topic cards and cannot trigger an outer viewport jump",
);

const refreshedActiveTopic = makeMessage("active-topic", {
    createdAt: activeTopic.createdAt,
    thread: {
        ...(activeTopic as any).thread,
        updatedAt: new Date("2026-07-17T11:05:00.000Z"),
        replyCount: 5,
    },
});
const refreshedMessages = mergeRefreshedTopicStarters(
    [looseMessage, olderTopic, activeTopic, topicReply],
    [olderTopic, refreshedActiveTopic],
);
assert.equal(
    (refreshedMessages.find((message) => message.id === "active-topic") as any).thread.replyCount,
    5,
    "refreshed starter metadata updates the displayed reply count",
);
assert.ok(
    refreshedMessages.some((message) => message.id === "topic-reply"),
    "refreshing starter metadata preserves already loaded replies",
);
assert.deepEqual(
    getTopicIndexMessages(refreshedMessages).map((message) => message.id),
    ["active-topic", "older-topic"],
    "reply activity does not reorder topic cards",
);
assert.deepEqual(
    getMainFeedTopicMessages([olderTopic, activeTopic]).map((message) => message.id),
    ["older-topic", "active-topic"],
    "the main feed defaults to oldest activity first so the latest activity is at the bottom",
);
assert.deepEqual(
    getMainFeedTopicMessages([olderTopic, activeTopic], "date_created").map((message) => message.id),
    ["active-topic", "older-topic"],
    "the personal date-created preference retains chronological topic order",
);
assert.deepEqual(
    reconcileDeferredTopicOrder(["active-topic", "older-topic"], ["older-topic", "active-topic"], true),
    ["active-topic", "older-topic"],
    "activity reordering is deferred while the topic viewport is locked",
);
assert.deepEqual(
    reconcileDeferredTopicOrder(["active-topic", "older-topic"], ["older-topic", "active-topic"], false),
    ["older-topic", "active-topic"],
    "the deferred activity order applies once the viewport is safe",
);
assert.deepEqual(
    reconcileDeferredTopicOrder(["active-topic"], ["older-topic", "active-topic", "new-topic"], true),
    ["active-topic", "older-topic", "new-topic"],
    "new topics are appended without moving an existing topic while ordering is locked",
);
assert.equal(shouldRenderTopicFeed(false, false), false, "topics wait for the persisted order before first render");
assert.equal(shouldRenderTopicFeed(true, true), false, "topics remain hidden while messages are loading");
assert.equal(shouldRenderTopicFeed(true, false), true, "topics render once messages and preference are ready");

const equalCreationTopicA = makeMessage("equal-creation-a", {
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    thread: {
        title: "Equal A",
        createdAt: new Date("2026-07-17T12:00:00.000Z"),
        updatedAt: new Date("2026-07-17T12:30:00.000Z"),
        replyCount: 0,
    },
});
const equalCreationTopicB = makeMessage("equal-creation-b", {
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    thread: {
        title: "Equal B",
        createdAt: new Date("2026-07-17T12:00:00.000Z"),
        updatedAt: new Date("2026-07-17T12:30:00.000Z"),
        replyCount: 0,
    },
});
const missingCreationTopicA = makeMessage("missing-creation-a", {
    createdAt: undefined as any,
    thread: {
        title: "Missing A",
        createdAt: undefined as any,
        updatedAt: undefined as any,
        replyCount: 0,
    },
});
const missingCreationTopicB = makeMessage("missing-creation-b", {
    createdAt: undefined as any,
    thread: {
        title: "Missing B",
        createdAt: undefined as any,
        updatedAt: undefined as any,
        replyCount: 0,
    },
});

assert.deepEqual(
    getTopicIndexMessages([equalCreationTopicA, equalCreationTopicB]).map((message) => message.id),
    ["equal-creation-a", "equal-creation-b"],
    "topics with equal original creation time keep their input order",
);

assert.deepEqual(
    getTopicIndexMessages([missingCreationTopicA, missingCreationTopicB]).map((message) => message.id),
    ["missing-creation-a", "missing-creation-b"],
    "topics with missing creation time keep their input order",
);

assert.equal(getInitialTopicTitle(0), FIRST_TOPIC_DEFAULT_TITLE, "first topic gets the neutral default title");
assert.equal(getInitialTopicTitle(1), "", "later topics are not prefilled");

const topicsInNonChronologicalInputOrder = [olderTopic, activeTopic];
assert.equal(
    selectOldestUnreadTopicId(topicsInNonChronologicalInputOrder, {
        "active-topic": 2,
        "older-topic": 1,
    }),
    "active-topic",
    "the oldest unread topic is selected using chronological topic order",
);
assert.equal(
    selectInitialTopicId({
        explicitTopicId: "older-topic",
        initialEntryHandled: false,
        messages: topicsInNonChronologicalInputOrder,
        unreadCounts: { "active-topic": 2 },
    }),
    "older-topic",
    "an explicit topic deep link overrides automatic unread selection",
);
assert.equal(
    selectInitialTopicId({
        initialEntryHandled: false,
        messages: topicsInNonChronologicalInputOrder,
        unreadCounts: {},
    }),
    undefined,
    "no unread topics preserves the existing entry behavior",
);
assert.equal(
    selectInitialTopicId({
        initialEntryHandled: true,
        messages: topicsInNonChronologicalInputOrder,
        unreadCounts: { "active-topic": 1 },
    }),
    undefined,
    "polling cannot reopen a topic after initial entry has been handled",
);
assert.equal(
    selectOldestUnreadTopicId([activeTopic, olderTopic], { "older-topic": 1 }),
    "older-topic",
    "opening one topic leaves another unread topic selectable",
);
assert.deepEqual(createTopicUnreadIndicator(3), { unreadCount: 3 }, "automatic opening snapshots the unread count");
assert.equal(createTopicUnreadIndicator(0), undefined, "read topics do not create visual indicators");
assert.equal(
    findFirstUnreadReplyId(
        [
            { id: "reply-1", createdBy: "did:other" },
            { id: "reply-2", createdBy: "did:me" },
            { id: "reply-3", createdBy: "did:other" },
            { id: "reply-4", createdBy: "did:other" },
        ],
        2,
        "did:me",
    ),
    "reply-3",
    "the separator starts at the first unread reply and ignores the current user's replies",
);
assert.deepEqual(
    resolveTopicUnreadBoundary({
        starter: { id: "topic", createdBy: "did:other" },
        replies: [
            { id: "reply-a", createdBy: "did:other" },
            { id: "reply-own", createdBy: "did:me" },
            { id: "reply-b", createdBy: "did:other" },
            { id: "reply-c", createdBy: "did:other" },
        ],
        unreadCount: 3,
        currentUserDid: "did:me",
        expectedReplyCount: 4,
    }),
    { isComplete: true, firstUnreadMessageId: "reply-a" },
    "the authoritative boundary starts at the first unread external reply",
);
assert.deepEqual(
    resolveTopicUnreadBoundary({
        starter: { id: "topic", createdBy: "did:other" },
        replies: [
            { id: "reply-a", createdBy: "did:other" },
            { id: "reply-b", createdBy: "did:other" },
            { id: "reply-c", createdBy: "did:other" },
        ],
        unreadCount: 2,
        currentUserDid: "did:me",
        expectedReplyCount: 3,
    }),
    { isComplete: true, firstUnreadMessageId: "reply-b" },
    "a confirmed read advances the boundary from A to B while C remains unread",
);
assert.deepEqual(
    resolveTopicUnreadBoundary({
        starter: { id: "topic", createdBy: "did:other" },
        replies: [
            { id: "reply-a", createdBy: "did:other" },
            { id: "reply-b", createdBy: "did:other" },
            { id: "reply-c", createdBy: "did:other" },
        ],
        unreadCount: 1,
        currentUserDid: "did:me",
        expectedReplyCount: 3,
    }),
    { isComplete: true, firstUnreadMessageId: "reply-c" },
    "progressive acknowledgement advances the boundary from B to C",
);
assert.deepEqual(
    resolveTopicUnreadBoundary({
        starter: { id: "topic", createdBy: "did:other" },
        replies: [{ id: "reply-a", createdBy: "did:other" }],
        unreadCount: 0,
        currentUserDid: "did:me",
        expectedReplyCount: 1,
    }),
    { isComplete: true },
    "the boundary disappears only when the authoritative unread count reaches zero",
);
assert.deepEqual(
    resolveTopicUnreadBoundary({
        starter: { id: "topic", createdBy: "did:other" },
        replies: [{ id: "reply-a", createdBy: "did:other" }],
        unreadCount: 2,
        currentUserDid: "did:me",
        expectedReplyCount: 2,
    }),
    { isComplete: false },
    "an incomplete loaded reply list fails closed",
);
assert.deepEqual(
    resolveTopicUnreadBoundary({
        starter: { id: "topic", createdBy: "did:me" },
        replies: [
            { id: "reply-own", createdBy: "did:me" },
            { id: "reply-external", createdBy: "did:other" },
        ],
        unreadCount: 1,
        currentUserDid: "did:me",
        expectedReplyCount: 2,
    }),
    { isComplete: true, firstUnreadMessageId: "reply-external" },
    "current-user messages do not corrupt the authoritative boundary",
);
assert.equal(shouldAcknowledgeTopicIndicatorFromDraft(""), false, "empty focus does not acknowledge the indicator");
assert.equal(shouldAcknowledgeTopicIndicatorFromDraft("   "), false, "whitespace does not acknowledge the indicator");
assert.equal(shouldAcknowledgeTopicIndicatorFromDraft("Reply"), true, "non-empty typing acknowledges the indicator");
const indicators = {
    "active-topic": { unreadCount: 3 },
    "older-topic": { unreadCount: 1 },
};
const withBoundary = recordTopicUnreadIndicatorBoundary(indicators, "active-topic", "reply-3");
assert.deepEqual(
    withBoundary["active-topic"],
    { unreadCount: 3, firstUnreadReplyId: "reply-3" },
    "capturing the visual boundary does not discard the pre-open count",
);
assert.deepEqual(
    withBoundary["older-topic"],
    indicators["older-topic"],
    "activity in one topic does not alter another topic's indicator",
);
const afterAcknowledgement = acknowledgeTopicUnreadIndicator(withBoundary, "active-topic");
assert.equal(afterAcknowledgement["active-topic"], undefined, "active engagement clears the selected indicator");
assert.deepEqual(
    afterAcknowledgement["older-topic"],
    indicators["older-topic"],
    "acknowledging one topic leaves other unread indicators intact",
);
assert.deepEqual(
    JSON.parse(JSON.stringify(withBoundary)),
    withBoundary,
    "the indicator snapshot can be restored after conversation re-entry within the browser session",
);

const pendingReply = makeMessage("temp-submission-1", {
    createdBy: "did:me",
    submissionId: "submission-1",
    status: "pending",
});
const failedReply = makeMessage("temp-submission-2", {
    createdBy: "did:me",
    submissionId: "submission-2",
    status: "failed",
    errorMessage: "Network response was lost",
});
assert.deepEqual(
    mergeAuthoritativeTopicReplies([], [pendingReply]).map((reply) => reply.id),
    [pendingReply.id],
    "pending replies remain visible before the server response",
);
assert.deepEqual(
    mergeAuthoritativeTopicReplies([pendingReply, failedReply], []).map((reply) => reply.id),
    [pendingReply.id, failedReply.id],
    "failed and pending replies survive an authoritative refresh that has not observed them yet",
);
const authoritativeReply = makeMessage("server-reply-1", {
    createdBy: "did:me",
    submissionId: "submission-1",
    attachments: [{ url: "/storage/reply.png", name: "reply.png", mimeType: "image/png", size: 10 }],
});
assert.deepEqual(
    mergeAuthoritativeTopicReplies([pendingReply], [authoritativeReply]),
    [authoritativeReply],
    "poll-before-response replaces a matching pending reply with the authoritative reply without duplication",
);
const confirmedReply = confirmOptimisticTopicReply(
    [pendingReply],
    pendingReply.id,
    pendingReply.submissionId!,
    authoritativeReply.id,
    authoritativeReply.createdAt,
);
assert.equal(confirmedReply.length, 1, "response-before-poll keeps exactly one reply");
assert.equal(confirmedReply[0].id, authoritativeReply.id, "confirmation replaces the temporary id in place");
assert.equal(confirmedReply[0].status, "sent", "confirmation replaces pending state without removing the reply");
assert.deepEqual(
    mergeAuthoritativeTopicReplies(confirmedReply, []),
    confirmedReply,
    "a stale refetch cannot temporarily remove a locally confirmed reply",
);
assert.deepEqual(
    confirmOptimisticTopicReply(
        [authoritativeReply, pendingReply],
        pendingReply.id,
        pendingReply.submissionId!,
        authoritativeReply.id,
    ),
    [authoritativeReply],
    "a late response after polling removes only the temporary duplicate",
);
assert.equal(isTopicViewportNearBottom({ scrollHeight: 1000, scrollTop: 760, clientHeight: 200 }), true);
assert.equal(isTopicViewportNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 200 }), false);
assert.equal(
    shouldAutoScrollTopicReplies({
        openedNormally: true,
        sentReply: false,
        incomingWasNearBottom: false,
        incomingCapturedScrollTop: 0,
        currentScrollTop: 0,
    }),
    true,
    "normal topic opening scrolls to the latest reply",
);
assert.equal(
    shouldAutoScrollTopicReplies({
        openedNormally: false,
        sentReply: true,
        incomingWasNearBottom: false,
        incomingCapturedScrollTop: 0,
        currentScrollTop: 0,
    }),
    true,
    "sending always reveals the outgoing reply",
);
assert.equal(
    shouldAutoScrollTopicReplies({
        openedNormally: false,
        sentReply: false,
        incomingWasNearBottom: true,
        incomingCapturedScrollTop: 700,
        currentScrollTop: 700,
    }),
    true,
    "incoming replies scroll when the reader stayed near the bottom",
);
assert.equal(
    shouldAutoScrollTopicReplies({
        openedNormally: false,
        sentReply: false,
        incomingWasNearBottom: true,
        incomingCapturedScrollTop: 700,
        currentScrollTop: 500,
    }),
    false,
    "incoming replies do not pull a reader who moved to older replies",
);
const composerTarget = { id: "composer" };
const repliesEndTarget = { id: "replies-end" };
const topicEndTarget = { id: "topic-end" };
assert.equal(
    selectTopicReplyScrollTarget({
        openedNormally: true,
        sentReply: false,
        topicEnd: topicEndTarget,
        composer: composerTarget,
        repliesEnd: repliesEndTarget,
    }),
    topicEndTarget,
    "normal opening targets the actual bottom after the Close topic control",
);
assert.equal(
    selectTopicReplyScrollTarget({
        openedNormally: false,
        sentReply: true,
        topicEnd: topicEndTarget,
        composer: composerTarget,
        repliesEnd: repliesEndTarget,
    }),
    composerTarget,
    "sending continues to target the composer below the outgoing reply",
);
assert.equal(
    selectTopicReplyScrollTarget({
        openedNormally: false,
        sentReply: false,
        topicEnd: topicEndTarget,
        composer: composerTarget,
        repliesEnd: repliesEndTarget,
    }),
    repliesEndTarget,
    "incoming replies retain the near-bottom reply-list target",
);
assert.equal(
    selectTopicReplyScrollTarget({
        openedNormally: true,
        sentReply: false,
        topicEnd: null,
        composer: composerTarget,
        repliesEnd: repliesEndTarget,
    }),
    composerTarget,
    "normal opening falls back safely if the expanded-topic end is unavailable",
);
assert.equal(shouldAcknowledgeTopicInteraction("scroll"), false, "automatic scrolling cannot acknowledge a topic");

console.log("chat-topic-utils tests passed");

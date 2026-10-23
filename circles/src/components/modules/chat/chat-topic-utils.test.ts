import assert from "node:assert/strict";
import type { ChatMessage } from "@/models/models";
import {
    FIRST_TOPIC_DEFAULT_TITLE,
    acknowledgeTopicUnreadIndicator,
    canPersistVisibleTopicRead,
    clearPersistedTopicReadBoundary,
    hasSufficientTopicReplyVisibility,
    hasCurrentTopicReplyGeometry,
    canUseTopicReadVisibilityTarget,
    consumePendingTopicScrollRequest,
    canApplyTopicReplyLoad,
    createTopicUnreadIndicator,
    findFirstUnreadReplyId,
    getInitialTopicTitle,
    getTopicIndexMessages,
    getTopicReplyChangeSignals,
    getTopicViewportSnapshot,
    mergeRefreshedTopicStarters,
    planTopicReplyLoad,
    selectInitialTopicId,
    selectFollowUpTopicReplySignal,
    selectOldestUnreadTopicId,
    selectUnreadTopicIds,
    recordTopicUnreadIndicatorBoundary,
    resolveTopicUnreadBoundary,
    shouldAcknowledgeTopicIndicatorFromDraft,
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

const visibleReadContext = {
    expectedConversationId: "conversation-1",
    currentConversationId: "conversation-1",
    expectedTopicId: "active-topic",
    currentTopicId: "active-topic",
    expectedLoadScope: 4,
    currentLoadScope: 4,
    isTopicOpen: true,
    isLatestReplyVisible: true,
    isDocumentVisible: true,
    isDocumentFocused: true,
    isRequestInFlight: false,
};
assert.equal(canPersistVisibleTopicRead(visibleReadContext), true, "a visible newest reply can advance read state");
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, isLatestReplyVisible: false }),
    false,
    "an expanded off-screen newest reply remains unread",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, isDocumentVisible: false }),
    false,
    "a hidden document cannot advance topic read state",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, isDocumentFocused: false }),
    false,
    "an unfocused document cannot advance topic read state",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, isTopicOpen: false }),
    false,
    "a collapsed topic cannot advance topic read state",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, isRequestInFlight: true }),
    false,
    "repeated visibility callbacks cannot overlap read persistence",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, currentLoadScope: 5 }),
    false,
    "a stale conversation load cannot advance topic read state",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, currentConversationId: "conversation-2" }),
    false,
    "a response from a previous conversation cannot advance topic read state",
);
assert.equal(
    canPersistVisibleTopicRead({ ...visibleReadContext, currentTopicId: "older-topic" }),
    false,
    "a response from a previous topic cannot advance topic read state",
);
assert.equal(
    hasSufficientTopicReplyVisibility({ isIntersecting: true, visibleHeight: 1, replyHeight: 200 }),
    false,
    "an obscured newest reply with only one visible pixel remains unread",
);
assert.equal(
    hasSufficientTopicReplyVisibility({ isIntersecting: true, visibleHeight: 48, replyHeight: 200 }),
    true,
    "a meaningfully visible newest reply can advance read state",
);
assert.equal(
    hasSufficientTopicReplyVisibility({ isIntersecting: true, visibleHeight: 24, replyHeight: 24 }),
    true,
    "a short newest reply advances only when its full height is visible",
);
const scrollRootRect = { top: 100, right: 500, bottom: 500, left: 100, height: 400 };
assert.equal(
    hasCurrentTopicReplyGeometry({
        targetRect: { top: 450, right: 400, bottom: 650, left: 200, height: 200 },
        scrollRootRect,
    }),
    true,
    "final geometry accepts 50 visible pixels inside the explicit scroll root",
);
assert.equal(
    hasCurrentTopicReplyGeometry({
        targetRect: { top: 499, right: 400, bottom: 699, left: 200, height: 200 },
        scrollRootRect,
    }),
    false,
    "final geometry rejects stale one-pixel visibility",
);
assert.equal(
    hasCurrentTopicReplyGeometry({
        targetRect: { top: 200, right: 400, bottom: 250, left: 200, height: 50 },
        scrollRootRect: null,
    }),
    false,
    "missing explicit scroll roots fail closed",
);
assert.equal(
    canUseTopicReadVisibilityTarget({
        hasScrollRoot: true,
        isTargetAttached: true,
        isCurrentTarget: false,
        pendingBoundaryMatches: true,
    }),
    false,
    "stale observer targets cannot persist read state",
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
assert.equal(
    canUseTopicReadVisibilityTarget({
        hasScrollRoot: true,
        isTargetAttached: true,
        isCurrentTarget: true,
        pendingBoundaryMatches: false,
    }),
    false,
    "changed pending boundaries invalidate older visibility candidates",
);
assert.equal(
    clearPersistedTopicReadBoundary("reply-4", "reply-3"),
    "reply-4",
    "a newer pending boundary survives completion of an older in-flight request",
);
assert.equal(
    clearPersistedTopicReadBoundary("reply-3", "reply-3"),
    null,
    "the persisted boundary is cleared after a successful request",
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

console.log("chat-topic-utils tests passed");

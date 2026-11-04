import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    createDebouncedTopicDraftWriter,
    getTopicTextDraftKey,
    readTopicTextDraft,
    writeTopicTextDraft,
    type TopicDraftStorage,
    type TopicDraftTimers,
} from "./topic-text-drafts";

const chatRoomSource = readFileSync(new URL("./chat-room.tsx", import.meta.url), "utf8");

const makeStorage = () => {
    const values = new Map<string, string>();
    const storage: TopicDraftStorage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
    };
    return { storage, values };
};

const makeTimers = () => {
    let nextId = 0;
    const callbacks = new Map<number, () => void>();
    const allCallbacks = new Map<number, () => void>();
    const timers: TopicDraftTimers = {
        setTimeout: (callback) => {
            const id = ++nextId;
            callbacks.set(id, callback);
            allCallbacks.set(id, callback);
            return id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: (timer) => {
            callbacks.delete(timer as unknown as number);
        },
    };
    return {
        timers,
        runAll() {
            const pending = Array.from(callbacks.values());
            callbacks.clear();
            pending.forEach((callback) => callback());
        },
        runCleared() {
            const pending = Array.from(allCallbacks.values());
            callbacks.clear();
            allCallbacks.clear();
            pending.forEach((callback) => callback());
        },
    };
};

test("draft keys isolate authenticated user, conversation and topic", () => {
    const first = getTopicTextDraftKey("did:one", "conversation", "topic");
    assert.ok(first);
    assert.notEqual(first, getTopicTextDraftKey("did:two", "conversation", "topic"));
    assert.notEqual(first, getTopicTextDraftKey("did:one", "other-conversation", "topic"));
    assert.notEqual(first, getTopicTextDraftKey("did:one", "conversation", "other-topic"));
    assert.equal(getTopicTextDraftKey(undefined, "conversation", "topic"), null);
});

test("draft text saves and restores without exposing another account's value", () => {
    const { storage } = makeStorage();
    const firstUserKey = getTopicTextDraftKey("did:one", "conversation", "topic")!;
    const secondUserKey = getTopicTextDraftKey("did:two", "conversation", "topic")!;
    writeTopicTextDraft(() => storage, firstUserKey, "private draft");
    assert.equal(
        readTopicTextDraft(() => storage, firstUserKey),
        "private draft",
    );
    assert.equal(
        readTopicTextDraft(() => storage, secondUserKey),
        "",
    );
});

test("debounce coalesces typing and flushes the old topic on navigation and unmount", () => {
    const { storage } = makeStorage();
    const fakeTimers = makeTimers();
    const writer = createDebouncedTopicDraftWriter(() => storage, 400, fakeTimers.timers);
    const firstKey = getTopicTextDraftKey("did:one", "conversation", "topic-one")!;
    const secondKey = getTopicTextDraftKey("did:one", "conversation", "topic-two")!;

    writer.schedule(firstKey, "first");
    writer.schedule(firstKey, "latest first");
    assert.equal(storage.getItem(firstKey), null);
    writer.schedule(secondKey, "second");
    assert.equal(
        readTopicTextDraft(() => storage, firstKey),
        "latest first",
    );
    writer.dispose();
    assert.equal(
        readTopicTextDraft(() => storage, secondKey),
        "second",
    );
    fakeTimers.runAll();
    assert.equal(
        readTopicTextDraft(() => storage, firstKey),
        "latest first",
    );
});

test("empty drafts remove storage and a stale timer cannot restore cleared text", () => {
    const { storage } = makeStorage();
    const fakeTimers = makeTimers();
    const writer = createDebouncedTopicDraftWriter(() => storage, 400, fakeTimers.timers);
    const key = getTopicTextDraftKey("did:one", "conversation", "topic")!;
    writeTopicTextDraft(() => storage, key, "old draft");
    writer.schedule(key, "new draft");
    writer.clear(key);
    fakeTimers.runCleared();
    assert.equal(storage.getItem(key), null);

    writer.schedule(key, "temporary");
    writer.schedule(key, "   ");
    fakeTimers.runAll();
    assert.equal(storage.getItem(key), null);
});

test("failed sends retain drafts while confirmed successful sends clear them", () => {
    const { storage } = makeStorage();
    const fakeTimers = makeTimers();
    const writer = createDebouncedTopicDraftWriter(() => storage, 400, fakeTimers.timers);
    const key = getTopicTextDraftKey("did:one", "conversation", "topic")!;

    writer.schedule(key, "retry me");
    writer.flush(); // A failed result leaves the draft untouched.
    assert.equal(
        readTopicTextDraft(() => storage, key),
        "retry me",
    );

    writer.schedule(key, "retry me");
    writer.clear(key); // Called only from confirmed-success branches in TopicCard.
    fakeTimers.runAll();
    assert.equal(storage.getItem(key), null);
});

test("unavailable, malformed and quota-limited storage fails safely", () => {
    const key = "draft";
    assert.equal(
        readTopicTextDraft(() => null, key),
        "",
    );
    assert.equal(
        readTopicTextDraft(() => {
            throw new Error("blocked");
        }, key),
        "",
    );
    const malformed: TopicDraftStorage = {
        getItem: () => "not-json",
        setItem: () => {
            throw new Error("quota");
        },
        removeItem: () => {
            throw new Error("blocked");
        },
    };
    assert.equal(
        readTopicTextDraft(() => malformed, key),
        "",
    );
    assert.doesNotThrow(() => writeTopicTextDraft(() => malformed, key, "text"));
});

test("only TopicCard persists drafts and clears them after confirmed message success", () => {
    assert.match(chatRoomSource, /getTopicTextDraftKey\(user\?\.did, conversationId, messageId\)/);
    assert.match(chatRoomSource, /createDebouncedTopicDraftWriter\(getBrowserTopicDraftStorage\)/);
    assert.doesNotMatch(chatRoomSource, /<ChatInput\b/);

    const topicReplyStart = chatRoomSource.indexOf("const submitTopicReply = async");
    const textReplyFlow = chatRoomSource.slice(
        topicReplyStart,
        chatRoomSource.indexOf("const handleSendReply = async"),
    );
    const textSuccess = textReplyFlow.indexOf("if (result.success)");
    const textDraftClear = textReplyFlow.indexOf("clearSentTopicTextDraft(outgoingDraftKey, sentText)");
    const textFailure = textReplyFlow.indexOf("} else {", textSuccess);
    assert.ok(textSuccess >= 0 && textDraftClear > textSuccess && textDraftClear < textFailure);

    const topicSendStart = chatRoomSource.indexOf("const handleSendReply = async", topicReplyStart);
    const composedReplyFlow = chatRoomSource.slice(
        topicSendStart,
        chatRoomSource.indexOf("const handleEditSubmit = async", topicSendStart),
    );
    const composedFailure = composedReplyFlow.indexOf("if (!result.success)");
    const composedDraftClear = composedReplyFlow.indexOf("clearSentTopicTextDraft(sendDraftKey, trimmed)");
    assert.ok(composedFailure >= 0 && composedDraftClear > composedFailure);
    assert.ok(composedReplyFlow.indexOf("const sendDraftKey = topicTextDraftKey") < composedFailure);
});

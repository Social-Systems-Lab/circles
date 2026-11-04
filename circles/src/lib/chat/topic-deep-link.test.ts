import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
    buildCanonicalChatRedirectPath,
    selectLoadedDeepLinkTopic,
    validateMessageDeepLink,
    validateTopicDeepLink,
} from "./topic-deep-link";

const conversationId = "64a000000000000000000001";
const topicId = "64a000000000000000000002";
const replyId = "64a000000000000000000003";
const legacyMessageId = "64a000000000000000000004";

test("valid topic in the authorized conversation is accepted", async () => {
    assert.equal(await validateTopicDeepLink(topicId, conversationId, async () => ({ _id: topicId })), topicId);
    assert.equal(selectLoadedDeepLinkTopic(topicId, [{ id: topicId, thread: {} }]), topicId);
});

test("missing, invalid, and cross-conversation topics are ignored", async () => {
    assert.equal(await validateTopicDeepLink(undefined, conversationId, async () => ({ _id: topicId })), undefined);
    assert.equal(await validateTopicDeepLink("invalid", conversationId, async () => ({ _id: topicId })), undefined);
    assert.equal(await validateTopicDeepLink(topicId, conversationId, async () => null), undefined);
    assert.equal(selectLoadedDeepLinkTopic(topicId, []), undefined);
    assert.equal(selectLoadedDeepLinkTopic(topicId, [{ id: topicId }]), undefined);
});

test("exact messages must belong to the authorized conversation and requested topic", async () => {
    const findMessage = async (messageId: string) =>
        messageId === replyId ? { conversationId, threadId: topicId } : null;
    assert.equal(await validateMessageDeepLink(replyId, conversationId, topicId, findMessage), replyId);
    assert.equal(await validateMessageDeepLink(replyId, conversationId, undefined, findMessage), undefined);
    assert.equal(
        await validateMessageDeepLink(replyId, conversationId, new ObjectId().toHexString(), findMessage),
        undefined,
    );
    assert.equal(await validateMessageDeepLink("invalid", conversationId, topicId, findMessage), undefined);
    assert.equal(await validateMessageDeepLink(replyId, conversationId, topicId, async () => null), undefined);
    assert.equal(
        await validateMessageDeepLink(replyId, conversationId, topicId, async () => ({
            conversationId: new ObjectId().toHexString(),
            threadId: topicId,
        })),
        undefined,
    );
});

test("topic starters and legacy messages validate only in their matching scope", async () => {
    assert.equal(
        await validateMessageDeepLink(topicId, conversationId, topicId, async () => ({ conversationId, thread: {} })),
        topicId,
    );
    assert.equal(
        await validateMessageDeepLink(legacyMessageId, conversationId, undefined, async () => ({ conversationId })),
        legacyMessageId,
    );
    assert.equal(
        await validateMessageDeepLink(legacyMessageId, conversationId, topicId, async () => ({ conversationId })),
        undefined,
    );
});

test("handle redirects preserve one syntactically valid topic ID", () => {
    assert.equal(buildCanonicalChatRedirectPath(conversationId, topicId), `/chat/${conversationId}?topic=${topicId}`);
});

test("handle redirects preserve canonical topic and exact-message parameters", () => {
    assert.equal(
        buildCanonicalChatRedirectPath(conversationId, topicId, replyId),
        `/chat/${conversationId}?topic=${topicId}&message=${replyId}`,
    );
    assert.equal(
        buildCanonicalChatRedirectPath(conversationId, undefined, legacyMessageId),
        `/chat/${conversationId}?message=${legacyMessageId}`,
    );
});

test("handle redirects safely ignore invalid or multiple topic values", () => {
    assert.equal(buildCanonicalChatRedirectPath(conversationId, "invalid"), `/chat/${conversationId}`);
    assert.equal(
        buildCanonicalChatRedirectPath(conversationId, [topicId, new ObjectId().toHexString()]),
        `/chat/${conversationId}`,
    );
});

test("handle redirects preserve invalid exact-navigation intent without accepting its target", () => {
    assert.equal(
        buildCanonicalChatRedirectPath(conversationId, undefined, "invalid"),
        `/chat/${conversationId}?message=`,
    );
    assert.equal(
        buildCanonicalChatRedirectPath(conversationId, topicId, [replyId, new ObjectId().toHexString()]),
        `/chat/${conversationId}?topic=${topicId}&message=`,
    );
});

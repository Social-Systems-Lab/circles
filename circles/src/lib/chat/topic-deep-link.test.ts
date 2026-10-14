import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { buildCanonicalChatRedirectPath, selectLoadedDeepLinkTopic, validateTopicDeepLink } from "./topic-deep-link";

const conversationId = "64a000000000000000000001";
const topicId = "64a000000000000000000002";

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

test("handle redirects preserve one syntactically valid topic ID", () => {
    assert.equal(buildCanonicalChatRedirectPath(conversationId, topicId), `/chat/${conversationId}?topic=${topicId}`);
});

test("handle redirects safely ignore invalid or multiple topic values", () => {
    assert.equal(buildCanonicalChatRedirectPath(conversationId, "invalid"), `/chat/${conversationId}`);
    assert.equal(buildCanonicalChatRedirectPath(conversationId, [topicId, new ObjectId().toHexString()]), `/chat/${conversationId}`);
});

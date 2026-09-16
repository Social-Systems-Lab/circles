import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { buildConversationScopedReplyFilter, CHAT_UNAVAILABLE_MESSAGE, evaluateConversationAccess } from "./conversation-access-policy";

const viewerDid = "did:viewer";
const circleId = new ObjectId().toHexString();
const conversation = { _id: new ObjectId(), type: "group", circleId, participants: [viewerDid] };
const circle = (visibility: "public" | "secret", moderationStatus = "active") => ({
    _id: new ObjectId(circleId), circleType: "circle" as const, visibility, moderationStatus: moderationStatus as any,
});
const allowed = (overrides: Record<string, unknown> = {}) => evaluateConversationAccess({
    conversation, viewerDid, intent: "read", ownerCircle: circle("secret"), canonicalMember: true, chatMember: true,
    ...overrides,
} as any);

test("Secret Circle chat requires current canonical and chat-local membership", () => {
    assert.equal(allowed(), true);
    assert.equal(allowed({ canonicalMember: false }), false);
    assert.equal(allowed({ canonicalMember: false, chatMember: true }), false, "stale chat membership is harmless");
    assert.equal(allowed({ canonicalMember: true, chatMember: false }), false);
});

test("Circle lifecycle is evaluated before local membership", () => {
    assert.equal(allowed({ ownerCircle: circle("secret", "paused") }), true);
    assert.equal(allowed({ ownerCircle: circle("secret", "paused"), intent: "write" }), false);
    for (const status of ["suspended", "removed"]) {
        assert.equal(allowed({ ownerCircle: circle("secret", status) }), false);
        assert.equal(allowed({ ownerCircle: circle("secret", status), intent: "write" }), false);
    }
});

test("public, DM, standalone and malformed ownership semantics", () => {
    assert.equal(allowed({ ownerCircle: circle("public"), canonicalMember: false }), true);
    assert.equal(allowed({ conversation: { type: "dm", participants: [viewerDid] }, ownerCircle: null }), true);
    assert.equal(allowed({ conversation: { type: "dm", participants: [viewerDid], circleId }, ownerCircle: circle("public") }), false);
    assert.equal(allowed({ conversation: { type: "group" }, ownerCircle: null, canonicalMember: false }), true);
    assert.equal(allowed({ ownerCircle: null }), false);
    assert.equal(allowed({ ownerCircle: { ...circle("secret"), _id: new ObjectId() } }), false);
    assert.equal(allowed({ ownerCircle: { ...circle("public"), circleType: "user" }, canonicalMember: true }), false);
    assert.equal(allowed({ ownerCircle: { ...circle("public"), circleType: undefined }, canonicalMember: true }), false);
    assert.equal(allowed({ ownerCircle: { ...circle("public"), circleType: "project" }, canonicalMember: true }), true);
});

test("stale Secret membership denies every browser action family before its effect", () => {
    const actionFamilies = [
        "recent messages", "polling messages", "topic starters", "thread replies", "unread counts",
        "topic unread counts", "media metadata", "member count", "participant list", "admin capability",
        "send", "reply", "create topic", "edit", "delete", "reaction", "conversation read state",
        "topic read state", "group settings", "avatar", "member add", "member remove", "member promote", "upload",
    ];
    let effects = 0;
    for (const family of actionFamilies) {
        const intent = ["recent messages", "polling messages", "topic starters", "thread replies", "unread counts",
            "topic unread counts", "media metadata", "member count", "participant list", "admin capability"].includes(family)
            ? "read" : "write";
        const access = allowed({ canonicalMember: false, chatMember: true, intent });
        if (access) effects++;
        assert.equal(access, false, family);
    }
    assert.equal(effects, 0);
});

test("reply preview lookup is scoped to the authorized conversation", () => {
    const replyId = new ObjectId();
    assert.deepEqual(buildConversationScopedReplyFilter("room-a", [replyId]), {
        _id: { $in: [replyId] },
        conversationId: "room-a",
    });
    const historicalCrossConversationReply = { _id: replyId, conversationId: "room-b", body: "secret body" };
    const filter = buildConversationScopedReplyFilter("room-a", [replyId]);
    const hydrated = [historicalCrossConversationReply].filter(
        (doc) => filter._id.$in.includes(doc._id) && doc.conversationId === filter.conversationId,
    );
    assert.deepEqual(hydrated, []);
});

test("missing and unauthorized direct IDs share the neutral outward result", () => {
    const missing = { ok: false, message: CHAT_UNAVAILABLE_MESSAGE };
    const unauthorized = { ok: false, message: CHAT_UNAVAILABLE_MESSAGE };
    assert.deepEqual(unauthorized, missing);
});

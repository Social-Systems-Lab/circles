import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { toCommentDeleteActionSuccess, toCommentDto } from "./comment-dto";

const createdAt = new Date("2026-08-23T08:00:00Z");
const editedAt = new Date("2026-08-23T09:00:00Z");
const id = new ObjectId();
const rawReactions = { like: 2 };
const dto = toCommentDto({
    _id: id,
    postId: "post-id",
    parentCommentId: "parent-id",
    content: "content",
    createdBy: "did:author",
    createdAt,
    editedAt,
    reactions: rawReactions,
    replies: 3,
    isDeleted: true,
    mentions: [{ type: "circle", id: "secret" }],
    mentionsDisplay: [{ name: "Secret" }],
    mentionsDetails: [{ name: "Secret" }],
    author: { private: true },
    userReaction: "like",
    unknown: { nested: "payload" },
} as never);

assert.deepEqual(dto, {
    _id: id.toString(),
    postId: "post-id",
    parentCommentId: "parent-id",
    content: "content",
    createdBy: "did:author",
    createdAt,
    editedAt,
    reactions: { like: 2 },
    replies: 3,
    isDeleted: true,
});
assert.notEqual(dto.reactions, rawReactions, "the DTO must not expose the persisted reaction container by reference");
for (const key of ["mentions", "mentionsDisplay", "mentionsDetails", "author", "userReaction", "unknown"]) {
    assert.equal(Object.hasOwn(dto, key), false, `${key} must not cross the Comment DTO boundary`);
}

const malformed = toCommentDto({
    _id: id,
    postId: "post-id",
    parentCommentId: null,
    content: "content",
    createdBy: "did:author",
    createdAt,
    reactions: {
        like: 4,
        zero: 0,
        nested: { secret: true },
        string: "12",
        negative: -1,
        fractional: 1.5,
        infinite: Number.POSITIVE_INFINITY,
    },
    replies: 0,
    isDeleted: "true",
} as never);
assert.deepEqual(malformed.reactions, { like: 4, zero: 0 });
assert.equal(Object.hasOwn(malformed, "isDeleted"), false);

for (const invalidEditedAt of [
    { secret: "payload" },
    "2026-08-23T09:00:00Z",
    123,
    [editedAt],
    null,
    new Date(Number.NaN),
]) {
    const invalid = toCommentDto({
        _id: id,
        postId: "post-id",
        parentCommentId: null,
        content: "content",
        createdBy: "did:author",
        createdAt,
        editedAt: invalidEditedAt,
        reactions: {},
        replies: 0,
    } as never);
    assert.equal(Object.hasOwn(invalid, "editedAt"), false, "malformed editedAt must not cross the DTO boundary");
}

let arbitraryToStringCalled = false;
const unsafeId = toCommentDto({
    _id: {
        toString: () => {
            arbitraryToStringCalled = true;
            return "attacker-id";
        },
    },
    reactions: {},
} as never);
assert.equal(arbitraryToStringCalled, false);
assert.equal(unsafeId._id, undefined);

for (const disposition of ["tombstone", "already-deleted"] as const) {
    const deletionPayload = toCommentDeleteActionSuccess(disposition, {
        _id: id,
        postId: "post-id",
        parentCommentId: null,
        content: "",
        createdBy: "anonymous",
        createdAt,
        reactions: {},
        replies: 1,
        isDeleted: true,
        mentions: [{ type: "circle", id: "must-not-survive" }],
    } as never);
    assert.equal(deletionPayload.success, true);
    assert.equal(deletionPayload.disposition, disposition);
    assert.deepEqual(deletionPayload.comment.mentions, [], `${disposition} action payload explicitly clears mentions`);
    assert.equal(deletionPayload.comment.content, "");
    assert.equal(deletionPayload.comment.createdBy, "anonymous");
    assert.deepEqual(deletionPayload.comment.reactions, {});
    assert.equal(deletionPayload.comment.isDeleted, true);
}

console.log("comment DTO tests passed");

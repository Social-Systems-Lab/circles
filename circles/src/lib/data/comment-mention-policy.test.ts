import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, CommentDisplay } from "@/models/models";
import { sanitizeCommentMentions } from "./comment-mention-policy";

const publicId = new ObjectId();
const secretId = new ObjectId();
const suspendedId = new ObjectId();
const removedId = new ObjectId();
const userId = new ObjectId();
const missingId = new ObjectId();
const mention = (label: string, identifier: string) => `[${label}](/circles/${identifier})`;

const circles = [
    {
        _id: publicId,
        name: "Public Canonical",
        handle: "public",
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
    },
    {
        _id: secretId,
        name: "Secret Canonical",
        handle: "secret",
        circleType: "circle",
        visibility: "secret",
        moderationStatus: "active",
    },
    {
        _id: suspendedId,
        name: "Suspended",
        handle: "suspended",
        circleType: "circle",
        visibility: "public",
        moderationStatus: "suspended",
    },
    {
        _id: removedId,
        name: "Removed",
        handle: "removed",
        circleType: "circle",
        visibility: "public",
        moderationStatus: "removed",
    },
    {
        _id: userId,
        name: "User Canonical",
        handle: "person",
        circleType: "user",
        visibility: "secret",
        moderationStatus: "active",
    },
] as Circle[];

const author = { name: "Author", handle: "author", did: "did:author", circleType: "user" } as Circle;
const baseComment = (overrides: Partial<CommentDisplay>): CommentDisplay => ({
    _id: new ObjectId().toString(),
    postId: new ObjectId().toString(),
    parentCommentId: null,
    content: "plain",
    createdBy: "did:author",
    createdAt: new Date("2026-08-22T00:00:00Z"),
    editedAt: new Date("2026-08-22T01:00:00Z"),
    reactions: { like: 2 },
    replies: 1,
    author,
    userReaction: "like",
    ...overrides,
});

function dependencies(memberIds: string[] = []) {
    let calls = 0;
    let requestedIds: string[] = [];
    return {
        get calls() {
            return calls;
        },
        get requestedIds() {
            return requestedIds;
        },
        findReadableCircles: async ({ objectIds, handles }: { objectIds: ObjectId[]; handles: string[] }) => {
            calls += 1;
            requestedIds = objectIds.map(String);
            return circles.filter((circle) => {
                const referenced =
                    objectIds.some((id) => id.equals(circle._id as ObjectId)) || handles.includes(circle.handle!);
                const lifecycleReadable = !["suspended", "removed"].includes(circle.moderationStatus!);
                const visibilityReadable =
                    circle.circleType === "user" ||
                    circle.visibility !== "secret" ||
                    memberIds.includes(circle._id!.toString());
                return referenced && lifecycleReadable && visibilityReadable;
            });
        },
    };
}

async function testCanonicalMatrix() {
    const contents = [
        mention("Forged", publicId.toString()),
        mention("Hidden", secretId.toString()),
        mention("User", userId.toString()),
        mention("Missing", missingId.toString()),
        mention("Suspended", suspendedId.toString()),
        mention("Removed", removedId.toString()),
        mention("Malformed", "public/child"),
    ];
    const sanitized = await sanitizeCommentMentions(
        contents.map((content) => baseComment({ content })),
        "did:outsider",
        dependencies(),
    );
    assert.deepEqual(
        sanitized.map((comment) => comment.content),
        [
            mention("Public Canonical", "public"),
            "Unavailable Circle",
            mention("User Canonical", "person"),
            "Unavailable Circle",
            "Unavailable Circle",
            "Unavailable Circle",
            "Unavailable Circle",
        ],
    );

    const [member] = await sanitizeCommentMentions(
        [baseComment({ content: mention("Old", secretId.toString()) })],
        "did:member",
        dependencies([secretId.toString()]),
    );
    assert.equal(member.content, mention("Secret Canonical", "secret"));

    const [superadmin] = await sanitizeCommentMentions(
        [baseComment({ content: mention("Old", secretId.toString()) })],
        "did:superadmin",
        dependencies(),
    );
    assert.equal(superadmin.content, "Unavailable Circle");
}

async function testRootReplyBatchAndMetadata() {
    const rootId = new ObjectId().toString();
    const forgedCircle = { _id: secretId, name: "Leaked", handle: "secret", description: "Leaked" } as Circle;
    const root = baseComment({
        _id: rootId,
        content: mention("Root", publicId.toString()),
        mentions: [{ type: "circle", id: secretId.toString() }],
        mentionsDisplay: [{ type: "circle", id: secretId.toString(), circle: forgedCircle }],
    });
    const reply = baseComment({
        parentCommentId: rootId,
        rootParentId: rootId,
        content: `${mention("Again", publicId.toString())} ${mention("Hidden", secretId.toString())}`,
        mentions: [{ type: "circle", id: publicId.toString() }],
    });
    const deps = dependencies();
    const results = await sanitizeCommentMentions([root, reply], "did:outsider", deps);

    assert.equal(deps.calls, 1);
    assert.equal(deps.requestedIds.filter((id) => id === publicId.toString()).length, 1);
    assert.equal(results[1].content, `${mention("Public Canonical", "public")} Unavailable Circle`);
    assert.equal(results[1].parentCommentId, rootId);
    assert.equal(results[1].rootParentId, rootId);
    for (const result of results) {
        assert.equal(Object.hasOwn(result, "mentions"), false);
        assert.equal(Object.hasOwn(result, "mentionsDisplay"), false);
        assert.equal(result.author, author);
        assert.deepEqual(result.reactions, { like: 2 });
        assert.equal(result.replies, 1);
        assert.equal(result.userReaction, "like");
        assert.ok(result.editedAt);
    }
}

async function main() {
    await testCanonicalMatrix();
    await testRootReplyBatchAndMetadata();
    console.log("comment mention policy tests passed");
}

void main();

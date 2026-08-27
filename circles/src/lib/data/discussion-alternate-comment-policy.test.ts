import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import type { Circle, Comment, CommentDisplay, PostDisplay } from "@/models/models";
import { toCommentDto } from "./comment-dto";
import { sanitizeCommentMentions } from "./comment-mention-policy";
import { addCommentToDiscussionWithDependencies } from "./discussion-comment-create";
import { addReadableAlternateDiscussionComment, getReadableAlternateDiscussion } from "./discussion-alternate-policy";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";

const actions = readFileSync("src/app/circles/[handle]/discussions/actions.ts", "utf8");
const dataSource = readFileSync("src/lib/data/discussion.ts", "utf8");

assert.match(actions, /getReadableAlternateDiscussion/);
assert.match(actions, /addReadableAlternateDiscussionComment/);
assert.match(dataSource, /discussion\.comments = comments\.map\(toCommentDto\)/);
assert.doesNotMatch(
    dataSource.slice(dataSource.indexOf("const comments ="), dataSource.indexOf("return discussion")),
    /\.\.\.c/,
);

const circleId = new ObjectId();
const feedId = new ObjectId();
const postId = new ObjectId();
const author = { did: "did:author", isVerified: true, circleType: "user" } as Circle;

const circle = (visibility: "public" | "secret", moderationStatus: "active" | "paused" | "suspended" | "removed") =>
    ({
        _id: circleId,
        visibility,
        moderationStatus,
        enabledModules: ["discussions"],
        circleType: "circle",
    }) as Circle;

const contextDependencies = (
    member: boolean,
    visibility: "public" | "secret" = "secret",
    moderationStatus: "active" | "paused" | "suspended" | "removed" = "active",
) => ({
    findPost: async () => ({
        _id: postId,
        feedId: feedId.toString(),
        circleId: circleId.toString(),
        postType: "discussion" as const,
        createdBy: author.did,
        content: "discussion",
        createdAt: new Date(),
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
    }),
    findFeed: async () => ({ _id: feedId, circleId: circleId.toString(), userGroups: ["everyone"] }),
    findCircle: async () => circle(visibility, moderationStatus),
    findMember: async (did: string) =>
        member ? { userDid: did, circleId: circleId.toString(), userGroups: [] } : null,
    findAuthor: async () => author,
    authorizeFeature: async () => true,
    canReadSource: async () => true,
});

const resolveContext =
    (
        member: boolean,
        visibility: "public" | "secret" = "secret",
        moderationStatus: "active" | "paused" | "suspended" | "removed" = "active",
    ) =>
    (id: string, viewerDid?: string) =>
        resolveReadablePostContext(id, viewerDid, contextDependencies(member, visibility, moderationStatus) as never);

const commentId = new ObjectId();
const baseComment = toCommentDto({
    _id: commentId,
    postId: postId.toString(),
    parentCommentId: null,
    content: `[Forged](/circles/${circleId})`,
    createdBy: author.did,
    createdAt: new Date(),
    reactions: { like: 1 },
    replies: 0,
    mentions: [{}],
    author: { private: true },
    unknown: { nested: true },
} as never) as CommentDisplay;

async function testReadOrchestration() {
    let loads = 0;
    const denied = await getReadableAlternateDiscussion(postId.toString(), "did:outsider", {
        resolveContext: resolveContext(false),
        loadDiscussion: async () => {
            loads += 1;
            throw new Error("denied reads must not load Comments");
        },
        sanitizeComments: async () => [],
        sanitizePost: async () => [],
    });
    assert.equal(denied, null);
    assert.equal(loads, 0);

    const order: string[] = [];
    let commentBatches = 0;
    const discussion = {
        _id: postId.toString(),
        postType: "discussion",
        feedId: feedId.toString(),
        circleId: circleId.toString(),
        createdBy: author.did,
        content: "discussion",
        createdAt: new Date(),
        reactions: {},
        comments: [baseComment],
    } as never as Omit<PostDisplay, "comments"> & { comments: CommentDisplay[] };
    const readable = await getReadableAlternateDiscussion(postId.toString(), "did:member", {
        resolveContext: resolveContext(true),
        loadDiscussion: async (_id, authorizedFeedId) => {
            order.push("load");
            assert.equal(authorizedFeedId, feedId.toString());
            return discussion;
        },
        sanitizeComments: async (comments) => {
            order.push("comments");
            commentBatches += 1;
            return comments.map((comment) => ({ ...comment, content: "sanitized" }));
        },
        sanitizePost: async (posts) => {
            order.push("post");
            assert.equal((posts[0] as unknown as typeof discussion).comments[0].content, "sanitized");
            return [...posts];
        },
    });
    assert.ok(readable);
    assert.equal(commentBatches, 1);
    assert.deepEqual(order, ["load", "comments", "post"]);
}

async function testAddOrchestration() {
    for (const viewerDid of ["did:outsider", "did:superadmin"]) {
        let authorizations = 0;
        let adds = 0;
        await assert.rejects(
            addReadableAlternateDiscussionComment(postId.toString(), { content: "comment" }, viewerDid, {
                resolveContext: resolveContext(false) as (
                    id: string,
                    did: string,
                ) => Promise<ReadablePostContext | null>,
                authorizeComment: async () => {
                    authorizations += 1;
                    return true;
                },
                addComment: async () => {
                    adds += 1;
                    return baseComment;
                },
                sanitizeComments: async (comments) => [...comments],
            }),
            /Forum post not found/,
        );
        assert.equal(authorizations, 0);
        assert.equal(adds, 0);
    }

    const sequence: string[] = [];
    const returned = await addReadableAlternateDiscussionComment(
        postId.toString(),
        { content: "comment", createdBy: "did:forged" },
        "did:member",
        {
            resolveContext: resolveContext(true) as (id: string, did: string) => Promise<ReadablePostContext | null>,
            authorizeComment: async () => {
                sequence.push("authorize");
                return true;
            },
            addComment: async (_id, comment) => {
                sequence.push("insert");
                assert.equal(comment.createdBy, "did:member");
                return { ...baseComment, content: comment.content! } as Comment;
            },
            sanitizeComments: async (comments) => {
                sequence.push("sanitize");
                return [...comments];
            },
        },
    );
    assert.equal(returned.content, "comment");
    assert.deepEqual(sequence, ["authorize", "insert", "sanitize"]);

    for (const featureAllowed of [true, false]) {
        let publicAuthorizations = 0;
        let publicAdds = 0;
        const publicAttempt = addReadableAlternateDiscussionComment(
            postId.toString(),
            { content: "public comment" },
            "did:public-nonmember",
            {
                resolveContext: resolveContext(false, "public") as (
                    id: string,
                    did: string,
                ) => Promise<ReadablePostContext | null>,
                authorizeComment: async () => {
                    publicAuthorizations += 1;
                    return featureAllowed;
                },
                addComment: async (_id, comment) => {
                    publicAdds += 1;
                    return { ...baseComment, content: comment.content! } as Comment;
                },
                sanitizeComments: async (comments) =>
                    comments.map((comment) => ({ ...comment, content: `${comment.content} sanitized` })),
            },
        );
        if (featureAllowed) {
            const publicResult = await publicAttempt;
            assert.equal(publicResult.content, "public comment sanitized");
            assert.equal(publicAdds, 1);
        } else {
            await assert.rejects(publicAttempt, /Not authorized to comment/);
            assert.equal(publicAdds, 0);
        }
        assert.equal(publicAuthorizations, 1);
    }

    for (const moderationStatus of ["suspended", "removed"] as const) {
        let adds = 0;
        await assert.rejects(
            addReadableAlternateDiscussionComment(postId.toString(), { content: "comment" }, "did:member", {
                resolveContext: resolveContext(true, "secret", moderationStatus) as (
                    id: string,
                    did: string,
                ) => Promise<ReadablePostContext | null>,
                authorizeComment: async () => true,
                addComment: async () => {
                    adds += 1;
                    return baseComment;
                },
                sanitizeComments: async (comments) => [...comments],
            }),
            /Forum post not found/,
        );
        assert.equal(adds, 0);
    }

    let pausedAdds = 0;
    await assert.rejects(
        addReadableAlternateDiscussionComment(postId.toString(), { content: "comment" }, "did:member", {
            resolveContext: resolveContext(true, "secret", "paused") as (
                id: string,
                did: string,
            ) => Promise<ReadablePostContext | null>,
            authorizeComment: async () => false,
            addComment: async () => {
                pausedAdds += 1;
                return baseComment;
            },
            sanitizeComments: async (comments) => [...comments],
        }),
        /Not authorized to comment/,
    );
    assert.equal(pausedAdds, 0);
}

async function testInsertAndReread() {
    const createdAt = new Date("2026-08-23T10:00:00Z");
    const activityAt = new Date("2026-08-23T10:00:01Z");
    const insertedId = new ObjectId();
    const forgedId = new ObjectId();
    let inserted: Comment | undefined;
    let updates = 0;
    const response = await addCommentToDiscussionWithDependencies(
        postId.toString(),
        {
            _id: forgedId,
            postId: "forged-post",
            parentCommentId: "parent-id",
            content: "content",
            createdBy: "did:server-user",
            createdAt: new Date("2000-01-01T00:00:00Z"),
            editedAt: { secret: "payload" },
            reactions: { like: 999, nested: { secret: true } } as never,
            replies: 999,
            isDeleted: true,
            mentionsDisplay: [{ secret: true }],
            mentionsDetails: [{ secret: true }],
            author: { secret: true },
            unknown: { secret: true },
        } as never,
        {
            findDiscussion: async () => ({ closed: false }),
            insertComment: async (comment) => {
                inserted = comment;
                return { insertedId };
            },
            updateLastActivity: async (_id, at) => {
                updates += 1;
                assert.equal(at, activityAt);
            },
            now: (() => {
                const values = [createdAt, activityAt];
                return () => values.shift()!;
            })(),
        },
    );
    assert.ok(inserted);
    assert.equal(Object.hasOwn(inserted, "_id"), false);
    assert.equal(inserted.postId, postId.toString());
    assert.equal(inserted.parentCommentId, "parent-id");
    assert.equal(inserted.content, "content");
    assert.equal(inserted.createdBy, "did:server-user");
    assert.equal(inserted.createdAt, createdAt);
    assert.equal(inserted.replies, 0);
    assert.deepEqual(inserted.reactions, {});
    assert.equal(Object.hasOwn(inserted, "isDeleted"), false);
    assert.equal(Object.hasOwn(inserted, "editedAt"), false);
    assert.equal(updates, 1);

    assert.deepEqual(response, {
        _id: insertedId.toString(),
        postId: postId.toString(),
        parentCommentId: "parent-id",
        content: "content",
        createdBy: "did:server-user",
        createdAt,
        reactions: {},
        replies: 0,
    });
    const reread = toCommentDto(inserted);
    assert.deepEqual(reread.reactions, {});
    assert.equal(Object.hasOwn(reread, "isDeleted"), false);
    assert.equal(Object.hasOwn(response, "editedAt"), false);
    assert.equal(Object.hasOwn(reread, "editedAt"), false);
    for (const key of ["mentions", "mentionsDisplay", "mentionsDetails", "author", "userReaction", "unknown"]) {
        assert.equal(Object.hasOwn(reread, key), false);
    }

    let closedInsert = false;
    await assert.rejects(
        addCommentToDiscussionWithDependencies(
            postId.toString(),
            { content: "comment", createdBy: "did:member" },
            {
                findDiscussion: async () => ({ closed: true }),
                insertComment: async () => {
                    closedInsert = true;
                    return { insertedId };
                },
                updateLastActivity: async () => undefined,
                now: () => createdAt,
            },
        ),
        /closed or not found/,
    );
    assert.equal(closedInsert, false);

    let stringEditedAtInsert: Comment | undefined;
    await addCommentToDiscussionWithDependencies(
        postId.toString(),
        { content: "comment", createdBy: "did:member", editedAt: "forged" } as never,
        {
            findDiscussion: async () => ({ closed: false }),
            insertComment: async (comment) => {
                stringEditedAtInsert = comment;
                return { insertedId };
            },
            updateLastActivity: async () => undefined,
            now: () => createdAt,
        },
    );
    assert.ok(stringEditedAtInsert);
    assert.equal(Object.hasOwn(stringEditedAtInsert, "editedAt"), false);
}

async function testMentionBatchAndEventDtoCompatibility() {
    let batches = 0;
    const sanitized = await sanitizeCommentMentions([baseComment], "did:outsider", {
        findReadableCircles: async () => {
            batches += 1;
            return [];
        },
    });
    assert.equal(batches, 1);
    assert.equal(sanitized[0].content, "Unavailable Circle");

    const eventHelperDto = toCommentDto({
        _id: commentId,
        postId: postId.toString(),
        parentCommentId: null,
        content: "event comment",
        createdBy: author.did,
        createdAt: new Date(),
        reactions: { like: 2 },
        replies: 0,
    });
    assert.deepEqual(Object.keys(eventHelperDto).sort(), [
        "_id",
        "content",
        "createdAt",
        "createdBy",
        "parentCommentId",
        "postId",
        "reactions",
        "replies",
    ]);
}

async function main() {
    await testReadOrchestration();
    await testAddOrchestration();
    await testInsertAndReread();
    await testMentionBatchAndEventDtoCompatibility();
    console.log("alternate Discussion comment policy tests passed");
}

main();

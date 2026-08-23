import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, CommentDisplay, PostDisplay } from "@/models/models";
import { sanitizeHighlightedCommentsOnPosts } from "./comment-mention-policy";

const circleId = new ObjectId();
const author = { did: "did:author", name: "Author", handle: "author", circleType: "user" } as Circle;
const timestamp = new Date("2026-08-22T00:00:00Z");

function comment(id: string, content: string, overrides: Partial<CommentDisplay> = {}): CommentDisplay {
    return {
        _id: id,
        postId: `post-${id}`,
        parentCommentId: null,
        content,
        createdBy: "did:author",
        createdAt: timestamp,
        editedAt: timestamp,
        reactions: { like: 3 },
        replies: 2,
        isDeleted: false,
        author,
        userReaction: "like",
        mentions: [{ type: "circle", id: circleId.toString() }],
        mentionsDisplay: [{ type: "circle", id: circleId.toString(), circle: author }],
        ...overrides,
    };
}

function post(id: string, highlightedComment?: CommentDisplay | null): PostDisplay {
    return {
        _id: id,
        feedId: "feed",
        createdBy: "did:author",
        createdAt: timestamp,
        content: `post-${id}`,
        reactions: { like: 7 },
        comments: 1,
        userGroups: [],
        author,
        circleType: "post",
        highlightedComment,
    } as PostDisplay;
}

async function main() {
    const plainPosts = [post("plain-a"), post("plain-b")];
    const unchanged = await sanitizeHighlightedCommentsOnPosts(plainPosts, "did:viewer", {
        findReadableCircles: async () => {
            throw new Error("empty highlighted batches must not resolve mentions");
        },
    });
    assert.deepEqual(unchanged, plainPosts);
    assert.equal(unchanged[0], plainPosts[0]);
    assert.equal(unchanged[1], plainPosts[1]);

    const first = comment("comment-a", `[Forged](/circles/${circleId})`, { rootParentId: "root-a" });
    (first as CommentDisplay & { mentionsDetails?: unknown }).mentionsDetails = [{ name: "Leaked" }];
    const deleted = comment("comment-b", "", { isDeleted: true, createdBy: "anonymous", reactions: {} });
    const posts = [post("a", first), post("middle", null), post("b", deleted), post("tail")];
    let resolutionCalls = 0;
    let requestedObjectIds: string[] = [];
    const result = await sanitizeHighlightedCommentsOnPosts(posts, "did:viewer", {
        findReadableCircles: async ({ objectIds }) => {
            resolutionCalls += 1;
            requestedObjectIds = objectIds.map(String);
            return [
                {
                    _id: circleId,
                    name: "Canonical",
                    handle: "canonical",
                    circleType: "circle",
                    visibility: "public",
                    moderationStatus: "active",
                } as Circle,
            ];
        },
    });

    assert.equal(resolutionCalls, 1);
    assert.deepEqual(requestedObjectIds, [circleId.toString()]);
    assert.deepEqual(result.map((value) => value._id), ["a", "middle", "b", "tail"]);
    assert.equal(result[0].highlightedComment?._id, first._id);
    assert.equal(result[0].highlightedComment?.content, "[Canonical](/circles/canonical)");
    assert.equal(result[2].highlightedComment?._id, deleted._id);
    assert.equal(result[2].highlightedComment?.content, "");
    assert.equal(result[2].highlightedComment?.isDeleted, true);
    assert.equal(result[1], posts[1]);
    assert.equal(result[3], posts[3]);

    for (const highlighted of [result[0].highlightedComment!, result[2].highlightedComment!]) {
        assert.equal(Object.hasOwn(highlighted, "mentions"), false);
        assert.equal(Object.hasOwn(highlighted, "mentionsDisplay"), false);
        assert.equal(Object.hasOwn(highlighted, "mentionsDetails"), false);
        assert.equal(highlighted.author, author);
        assert.equal(highlighted.createdAt, timestamp);
        assert.equal(highlighted.editedAt, timestamp);
        assert.equal(highlighted.replies, 2);
        assert.equal(highlighted.userReaction, "like");
    }
    assert.deepEqual(result[0].reactions, posts[0].reactions);
    assert.equal(result[0].content, posts[0].content);
    assert.equal(result[0].highlightedComment?.rootParentId, "root-a");

    const inaccessible = comment("comment-secret", `[Hidden](/circles/${circleId})`, { rootParentId: "root-secret" });
    const [inaccessibleResult] = await sanitizeHighlightedCommentsOnPosts(
        [post("secret", inaccessible)],
        "did:outsider",
        { findReadableCircles: async () => [] },
    );
    assert.equal(inaccessibleResult.highlightedComment?.content, "Unavailable Circle");
    assert.equal(Object.hasOwn(inaccessibleResult.highlightedComment!, "mentions"), false);
    assert.equal(Object.hasOwn(inaccessibleResult.highlightedComment!, "mentionsDisplay"), false);
    assert.equal(inaccessibleResult.highlightedComment?._id, inaccessible._id);
    assert.equal(inaccessibleResult.highlightedComment?.author, author);
    assert.deepEqual(inaccessibleResult.highlightedComment?.reactions, { like: 3 });
    assert.equal(inaccessibleResult.highlightedComment?.rootParentId, "root-secret");

    console.log("highlighted comment mention policy tests passed");
}

void main();

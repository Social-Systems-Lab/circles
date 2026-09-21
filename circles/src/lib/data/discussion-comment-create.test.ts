import { describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Comment, Mention } from "@/models/models";
import {
    type AddCommentToDiscussionDependencies,
    addCommentToDiscussionWithDependencies,
    createCommentForAuthorizedPost,
} from "./discussion-comment-create";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const insertedId = new ObjectId();
const parentId = new ObjectId();
const mentions: Mention[] = [{ type: "circle", id: "c1" }];

const prepared = (overrides: Record<string, unknown> = {}) => ({
    content: "canonical",
    parentCommentId: null as string | null,
    mentions,
    ...overrides,
});

describe("createCommentForAuthorizedPost", () => {
    const dependencies = () => ({
        insertComment: mock(async (_comment: Comment) => ({ insertedId })),
        incrementParentReplies: mock(async (_id: ObjectId) => {}),
        now: () => NOW,
    });

    test("stores a new comment with counters zeroed and the given author and time", async () => {
        const deps = dependencies();

        const comment = await createCommentForAuthorizedPost("post-1", prepared(), "did:author", deps);

        expect(deps.insertComment).toHaveBeenCalledWith({
            postId: "post-1",
            createdAt: NOW,
            createdBy: "did:author",
            content: "canonical",
            parentCommentId: null,
            mentions,
            reactions: {},
            replies: 0,
        } as unknown as Comment);
        expect(comment).toEqual({
            postId: "post-1",
            createdAt: NOW,
            createdBy: "did:author",
            content: "canonical",
            parentCommentId: null,
            mentions,
            reactions: {},
            replies: 0,
            _id: insertedId,
        } as unknown as Comment);
    });

    test("does not store the id on the inserted document, only on the returned comment", async () => {
        const deps = dependencies();

        await createCommentForAuthorizedPost("post-1", prepared(), "did:author", deps);

        expect(deps.insertComment.mock.calls[0][0]).not.toHaveProperty("_id");
    });

    test("does not touch a parent for a top-level comment", async () => {
        const deps = dependencies();

        await createCommentForAuthorizedPost("post-1", prepared(), "did:author", deps);

        expect(deps.incrementParentReplies).not.toHaveBeenCalled();
    });

    test("bumps the reply count of the parent after inserting a reply", async () => {
        const deps = dependencies();
        const order: string[] = [];
        deps.insertComment.mockImplementation(async () => (order.push("insert"), { insertedId }));
        deps.incrementParentReplies.mockImplementation(async () => void order.push("increment"));

        await createCommentForAuthorizedPost("post-1", prepared({ parentCommentId: parentId.toString() }), "did:author", deps);

        expect(order).toEqual(["insert", "increment"]);
        expect(deps.incrementParentReplies).toHaveBeenCalledWith(parentId);
    });

    test("does not bump the parent when the insert fails", async () => {
        const deps = dependencies();
        deps.insertComment.mockRejectedValue(new Error("insert failed"));

        await expect(
            createCommentForAuthorizedPost("post-1", prepared({ parentCommentId: parentId.toString() }), "did:author", deps),
        ).rejects.toThrow("insert failed");

        expect(deps.incrementParentReplies).not.toHaveBeenCalled();
    });

    test("propagates a failure to bump the parent", async () => {
        const deps = dependencies();
        deps.incrementParentReplies.mockRejectedValue(new Error("increment failed"));

        await expect(
            createCommentForAuthorizedPost("post-1", prepared({ parentCommentId: parentId.toString() }), "did:author", deps),
        ).rejects.toThrow("increment failed");
    });

    test("ignores extra fields on the prepared input", async () => {
        const deps = dependencies();

        await createCommentForAuthorizedPost("post-1", prepared({ isDeleted: true, reactions: { like: 99 } }), "did:author", deps);

        expect(deps.insertComment.mock.calls[0][0]).toMatchObject({ reactions: {}, replies: 0 });
        expect(deps.insertComment.mock.calls[0][0]).not.toHaveProperty("isDeleted");
    });
});

describe("addCommentToDiscussionWithDependencies", () => {
    const discussionId = new ObjectId().toString();

    const setup = (overrides: Partial<AddCommentToDiscussionDependencies> = {}) => {
        const base = {
            findDiscussion: mock(async (_id: ObjectId): Promise<{ closed?: boolean } | null> => ({ closed: false })),
            insertComment: mock(async (_comment: Comment) => ({ insertedId })),
            incrementParentReplies: mock(async (_id: ObjectId) => {}),
            updateLastActivity: mock(async (_id: ObjectId, _at: Date) => {}),
            now: () => NOW,
            prepareComment: mock(async (input: { content: string; parentCommentId?: string | null }) => prepared({ content: `prepared:${input.content}`, parentCommentId: input.parentCommentId ?? null })),
            findParentComment: mock(async (_id: ObjectId) => null),
            toCommentDto: mock((comment: Comment) => ({ dto: true, content: comment.content })),
        };
        return { ...base, ...overrides } as typeof base;
    };
    const add = (dependencies: ReturnType<typeof setup>, data: Record<string, unknown> = {}) =>
        addCommentToDiscussionWithDependencies(
            discussionId,
            { content: "hello", createdBy: "did:author", ...data },
            dependencies as unknown as AddCommentToDiscussionDependencies,
        );

    test("adds a prepared comment to an open discussion and returns its DTO", async () => {
        const dependencies = setup();

        const result = await add(dependencies);

        expect(result).toEqual({ dto: true, content: "prepared:hello" } as never);
        expect(dependencies.insertComment.mock.calls[0][0]).toMatchObject({
            postId: discussionId,
            createdBy: "did:author",
            content: "prepared:hello",
            createdAt: NOW,
        });
    });

    test("asks the preparation policy to validate the content for the author", async () => {
        const dependencies = setup();

        await add(dependencies, { parentCommentId: parentId.toString() });

        expect(dependencies.prepareComment).toHaveBeenCalledWith({
            postId: discussionId,
            parentCommentId: parentId.toString(),
            content: "hello",
            writerDid: "did:author",
            dependencies: { findParentComment: dependencies.findParentComment },
        });
    });

    test("records the discussion's last activity time", async () => {
        const dependencies = setup();

        await add(dependencies);

        expect(dependencies.updateLastActivity).toHaveBeenCalledWith(new ObjectId(discussionId), NOW);
    });

    test("bumps the parent's reply count for a reply", async () => {
        const dependencies = setup();

        await add(dependencies, { parentCommentId: parentId.toString() });

        expect(dependencies.incrementParentReplies).toHaveBeenCalledWith(parentId);
    });

    test.each([
        ["does not exist", null],
        ["is closed", { closed: true }],
    ])("rejects a discussion that %s", async (_label, discussion) => {
        const dependencies = setup({ findDiscussion: mock(async () => discussion) });

        await expect(add(dependencies)).rejects.toThrow("Forum post is closed or not found");

        expect(dependencies.prepareComment).not.toHaveBeenCalled();
        expect(dependencies.insertComment).not.toHaveBeenCalled();
        expect(dependencies.updateLastActivity).not.toHaveBeenCalled();
    });

    test("treats a discussion without a closed flag as open", async () => {
        const dependencies = setup({ findDiscussion: mock(async () => ({})) });

        await add(dependencies);

        expect(dependencies.insertComment).toHaveBeenCalledTimes(1);
    });

    test("does not store anything or update activity when preparation rejects the comment", async () => {
        const dependencies = setup({ prepareComment: mock(async () => Promise.reject(new Error("Comment target unavailable."))) as never });

        await expect(add(dependencies)).rejects.toThrow("Comment target unavailable.");

        expect(dependencies.insertComment).not.toHaveBeenCalled();
        expect(dependencies.updateLastActivity).not.toHaveBeenCalled();
    });

    test("throws for a discussion id that is not an ObjectId, before any lookup", async () => {
        const dependencies = setup();

        await expect(
            addCommentToDiscussionWithDependencies("bogus", { content: "x", createdBy: "did:a" }, dependencies as never),
        ).rejects.toThrow();
        expect(dependencies.findDiscussion).not.toHaveBeenCalled();
    });

    test("uses the real comment DTO mapper when none is injected", async () => {
        const dependencies = setup({ toCommentDto: undefined });

        const result = (await add(dependencies)) as { _id: string; content: string; mentions?: unknown };

        expect(result._id).toBe(insertedId.toString());
        expect(result.content).toBe("prepared:hello");
        expect(result).not.toHaveProperty("mentions");
    });
});

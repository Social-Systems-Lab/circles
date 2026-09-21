import { describe, expect, mock, test } from "bun:test";
import type { Comment, CommentDisplay, PostDisplay } from "@/models/models";
import type { ReadablePostContext } from "./post-access-policy";
import {
    addReadableAlternateDiscussionComment,
    getReadableAlternateDiscussion,
} from "./discussion-alternate-policy";

const contextFor = (post: Record<string, unknown>) =>
    ({ post: { _id: "post-1", feedId: "feed-1", postType: "discussion", ...post }, feed: {}, circle: {} }) as unknown as ReadablePostContext;

const commentDisplay = (content: string) => ({ content }) as unknown as CommentDisplay;

describe("getReadableAlternateDiscussion", () => {
    const readInput = () => {
        const discussion = { _id: "post-1", title: "Topic", comments: [commentDisplay("raw")] };
        const dependencies = {
            resolveContext: mock(async (_postId: string, _viewerDid?: string) => contextFor({}) as ReadablePostContext | null),
            loadDiscussion: mock(async (_postId: string, _feedId: string) => discussion as never),
            sanitizeComments: mock(async (_comments: readonly CommentDisplay[], _viewerDid?: string) => [commentDisplay("clean")]),
            sanitizePost: mock(async (posts: PostDisplay[], _viewerDid?: string) => posts.map((post) => ({ ...post, sanitized: true }) as unknown as PostDisplay)),
        };
        return { discussion, dependencies };
    };

    test("returns the discussion with sanitized comments and a sanitized post", async () => {
        const { dependencies } = readInput();

        const result = await getReadableAlternateDiscussion("post-1", "did:viewer", dependencies);

        expect(result).toMatchObject({ title: "Topic", sanitized: true, comments: [{ content: "clean" }] });
    });

    test("loads the discussion from the feed the viewer was authorized for", async () => {
        const { dependencies } = readInput();
        dependencies.resolveContext.mockResolvedValue(contextFor({ feedId: "authorized-feed" }));

        await getReadableAlternateDiscussion("post-1", "did:viewer", dependencies);

        expect(dependencies.resolveContext).toHaveBeenCalledWith("post-1", "did:viewer");
        expect(dependencies.loadDiscussion).toHaveBeenCalledWith("post-1", "authorized-feed");
    });

    test("sanitizes comments for the viewer before sanitizing the post", async () => {
        const { dependencies, discussion } = readInput();

        await getReadableAlternateDiscussion("post-1", "did:viewer", dependencies);

        expect(dependencies.sanitizeComments).toHaveBeenCalledWith([expect.objectContaining({ content: "raw" })], "did:viewer");
        expect(dependencies.sanitizePost).toHaveBeenCalledWith([discussion], "did:viewer");
        const sanitizedPostInput = dependencies.sanitizePost.mock.calls[0][0][0] as unknown as { comments: CommentDisplay[] };
        expect(sanitizedPostInput.comments).toEqual([commentDisplay("clean")]);
    });

    test("works for anonymous viewers", async () => {
        const { dependencies } = readInput();

        await getReadableAlternateDiscussion("post-1", undefined, dependencies);

        expect(dependencies.resolveContext).toHaveBeenCalledWith("post-1", undefined);
        expect(dependencies.sanitizeComments.mock.calls[0][1]).toBeUndefined();
    });

    test("returns null when the post cannot be read", async () => {
        const { dependencies } = readInput();
        dependencies.resolveContext.mockResolvedValue(null);

        expect(await getReadableAlternateDiscussion("post-1", "did:viewer", dependencies)).toBeNull();
        expect(dependencies.loadDiscussion).not.toHaveBeenCalled();
    });

    test.each(["post", "event", "task", undefined])("returns null for a %p post, which is not a discussion", async (postType) => {
        const { dependencies } = readInput();
        dependencies.resolveContext.mockResolvedValue(contextFor({ postType }));

        expect(await getReadableAlternateDiscussion("post-1", "did:viewer", dependencies)).toBeNull();
        expect(dependencies.loadDiscussion).not.toHaveBeenCalled();
    });

    test("returns null when the discussion cannot be loaded", async () => {
        const { dependencies } = readInput();
        dependencies.loadDiscussion.mockResolvedValue(null as never);

        expect(await getReadableAlternateDiscussion("post-1", "did:viewer", dependencies)).toBeNull();
        expect(dependencies.sanitizeComments).not.toHaveBeenCalled();
        expect(dependencies.sanitizePost).not.toHaveBeenCalled();
    });

    test("propagates sanitizer failures rather than returning unsanitized content", async () => {
        const { dependencies } = readInput();
        dependencies.sanitizeComments.mockRejectedValue(new Error("sanitize failed"));

        await expect(getReadableAlternateDiscussion("post-1", "did:viewer", dependencies)).rejects.toThrow("sanitize failed");
    });
});

describe("addReadableAlternateDiscussionComment", () => {
    const addInput = () => {
        const dependencies = {
            resolveContext: mock(async (_postId: string, _viewerDid: string) => contextFor({ _id: "canonical-post" }) as ReadablePostContext | null),
            authorizeComment: mock(async (_context: ReadablePostContext, _viewerDid: string) => true),
            addComment: mock(async (_postId: string, _data: unknown) => ({ content: "stored" }) as unknown as Comment),
            sanitizeComments: mock(async (_comments: readonly CommentDisplay[], _viewerDid: string) => [commentDisplay("sanitized")]),
        };
        return dependencies;
    };

    test("adds the comment as the viewer and returns the sanitized result", async () => {
        const dependencies = addInput();

        const result = await addReadableAlternateDiscussionComment("post-1", { content: "hi" }, "did:viewer", dependencies);

        expect(result).toEqual(commentDisplay("sanitized"));
        expect(dependencies.addComment).toHaveBeenCalledWith("canonical-post", { content: "hi", createdBy: "did:viewer" });
        expect(dependencies.sanitizeComments).toHaveBeenCalledWith([{ content: "stored" }], "did:viewer");
    });

    test("uses the canonical id of the resolved post rather than the requested one", async () => {
        const dependencies = addInput();

        await addReadableAlternateDiscussionComment("REQUESTED-ID", { content: "hi" }, "did:viewer", dependencies);

        expect(dependencies.addComment.mock.calls[0][0]).toBe("canonical-post");
    });

    test("keeps the parent comment id of a reply", async () => {
        const dependencies = addInput();

        await addReadableAlternateDiscussionComment("post-1", { content: "hi", parentCommentId: "parent" }, "did:viewer", dependencies);

        expect(dependencies.addComment.mock.calls[0][1]).toEqual({ content: "hi", parentCommentId: "parent", createdBy: "did:viewer" });
    });

    test("ignores a createdBy supplied by the caller", async () => {
        const dependencies = addInput();

        await addReadableAlternateDiscussionComment("post-1", { content: "hi", createdBy: "did:victim" } as never, "did:viewer", dependencies);

        expect(dependencies.addComment.mock.calls[0][1]).toMatchObject({ createdBy: "did:viewer" });
    });

    test("rejects when the discussion cannot be read", async () => {
        const dependencies = addInput();
        dependencies.resolveContext.mockResolvedValue(null);

        await expect(addReadableAlternateDiscussionComment("post-1", { content: "hi" }, "did:viewer", dependencies)).rejects.toThrow(
            "Forum post not found",
        );
        expect(dependencies.addComment).not.toHaveBeenCalled();
    });

    test.each(["post", "event", undefined])("rejects a %p post as not a forum post", async (postType) => {
        const dependencies = addInput();
        dependencies.resolveContext.mockResolvedValue(contextFor({ postType }));

        await expect(addReadableAlternateDiscussionComment("post-1", { content: "hi" }, "did:viewer", dependencies)).rejects.toThrow(
            "Forum post not found",
        );
        expect(dependencies.authorizeComment).not.toHaveBeenCalled();
    });

    test("rejects when the viewer may not comment", async () => {
        const dependencies = addInput();
        dependencies.authorizeComment.mockResolvedValue(false);

        await expect(addReadableAlternateDiscussionComment("post-1", { content: "hi" }, "did:viewer", dependencies)).rejects.toThrow(
            "Not authorized to comment",
        );
        expect(dependencies.addComment).not.toHaveBeenCalled();
    });

    test("authorizes against the resolved context", async () => {
        const dependencies = addInput();
        const context = contextFor({ _id: "canonical-post" });
        dependencies.resolveContext.mockResolvedValue(context);

        await addReadableAlternateDiscussionComment("post-1", { content: "hi" }, "did:viewer", dependencies);

        expect(dependencies.authorizeComment).toHaveBeenCalledWith(context, "did:viewer");
    });
});

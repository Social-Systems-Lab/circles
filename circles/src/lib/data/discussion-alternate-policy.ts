import type { Comment, CommentDisplay, PostDisplay } from "@/models/models";
import type { ReadablePostContext } from "./post-access-policy";

type DiscussionWithComments = Omit<PostDisplay, "comments"> & { comments: CommentDisplay[] };

export type AlternateDiscussionReadDependencies = {
    resolveContext: (postId: string, viewerDid?: string) => Promise<ReadablePostContext | null>;
    loadDiscussion: (postId: string, authorizedFeedId: string) => Promise<DiscussionWithComments | null>;
    sanitizeComments: (comments: readonly CommentDisplay[], viewerDid?: string) => Promise<CommentDisplay[]>;
    sanitizePost: (posts: PostDisplay[], viewerDid?: string) => Promise<PostDisplay[]>;
};

export async function getReadableAlternateDiscussion(
    postId: string,
    viewerDid: string | undefined,
    dependencies: AlternateDiscussionReadDependencies,
): Promise<PostDisplay | null> {
    const context = await dependencies.resolveContext(postId, viewerDid);
    if (!context || context.post.postType !== "discussion") return null;

    const discussion = await dependencies.loadDiscussion(postId, context.post.feedId);
    if (!discussion) return null;
    discussion.comments = await dependencies.sanitizeComments(discussion.comments, viewerDid);
    const [sanitizedDiscussion] = await dependencies.sanitizePost([discussion as unknown as PostDisplay], viewerDid);
    return sanitizedDiscussion;
}

export type AlternateDiscussionAddDependencies = {
    resolveContext: (postId: string, viewerDid: string) => Promise<ReadablePostContext | null>;
    authorizeComment: (context: ReadablePostContext, viewerDid: string) => Promise<boolean>;
    addComment: (postId: string, data: Partial<Comment>) => Promise<Comment>;
    sanitizeComments: (comments: readonly CommentDisplay[], viewerDid: string) => Promise<CommentDisplay[]>;
};

export async function addReadableAlternateDiscussionComment(
    postId: string,
    data: Partial<Comment>,
    viewerDid: string,
    dependencies: AlternateDiscussionAddDependencies,
): Promise<CommentDisplay> {
    const context = await dependencies.resolveContext(postId, viewerDid);
    if (!context || context.post.postType !== "discussion") throw new Error("Forum post not found");
    if (!(await dependencies.authorizeComment(context, viewerDid))) throw new Error("Not authorized to comment");

    const comment = await dependencies.addComment(postId, { ...data, createdBy: viewerDid });
    const [sanitizedComment] = await dependencies.sanitizeComments([comment as CommentDisplay], viewerDid);
    return sanitizedComment;
}

import type { CommentDisplay, PostDisplay } from "@/models/models";
import { sanitizeCircleMentionsInTextItems, type MentionContentPolicyDependencies } from "./mention-content-policy";

export function sanitizeCommentMentions(
    comments: readonly CommentDisplay[],
    viewerDid?: string,
    dependencies?: MentionContentPolicyDependencies,
): Promise<CommentDisplay[]> {
    return sanitizeCircleMentionsInTextItems(comments, viewerDid, dependencies);
}

export async function sanitizeHighlightedCommentsOnPosts(
    posts: readonly PostDisplay[],
    viewerDid?: string,
    dependencies?: MentionContentPolicyDependencies,
): Promise<PostDisplay[]> {
    const highlightedPositions: number[] = [];
    const highlightedComments: CommentDisplay[] = [];

    posts.forEach((post, index) => {
        if (post.highlightedComment) {
            highlightedPositions.push(index);
            highlightedComments.push(post.highlightedComment);
        }
    });

    if (highlightedComments.length === 0) return [...posts];

    const sanitizedComments = (await sanitizeCommentMentions(highlightedComments, viewerDid, dependencies)).map(
        (comment) => {
            const sanitized = { ...comment } as CommentDisplay & { mentionsDetails?: unknown };
            delete sanitized.mentionsDetails;
            return sanitized;
        },
    );
    const sanitizedByPosition = new Map(
        highlightedPositions.map((postIndex, commentIndex) => [postIndex, sanitizedComments[commentIndex]]),
    );

    return posts.map((post, index) => {
        const highlightedComment = sanitizedByPosition.get(index);
        return highlightedComment ? { ...post, highlightedComment } : post;
    });
}

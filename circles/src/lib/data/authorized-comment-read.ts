import type { Comment, CommentDisplay } from "@/models/models";
import { toCommentDto } from "./comment-dto";

/**
 * Load ordinary-client Comment DTOs for a Post whose parent access was already authorized.
 * This helper deliberately performs no authorization, hydration, or mention policy.
 */
export async function getCommentDtosForAuthorizedPost(
    postId: string,
    dependencies: { findComments: (postId: string) => Promise<Comment[]> } = {
        findComments: async (authorizedPostId) => {
            const { Comments } = await import("./db");
            return (await Comments.find({ postId: authorizedPostId }).toArray()) as Comment[];
        },
    },
): Promise<CommentDisplay[]> {
    const comments = await dependencies.findComments(postId);
    return comments.map(toCommentDto) as CommentDisplay[];
}

import type { CommentDisplay } from "@/models/models";

export function replaceCommentWithServerResult(
    comments: readonly CommentDisplay[],
    serverComment: CommentDisplay,
): CommentDisplay[] {
    return comments.map((comment) => (comment._id === serverComment._id ? serverComment : comment));
}

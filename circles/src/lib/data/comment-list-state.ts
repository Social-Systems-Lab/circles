import type { CommentDisplay } from "@/models/models";
import type { CommentDeleteDisposition } from "./comment-delete-access-policy";

export function replaceCommentWithServerResult(
    comments: readonly CommentDisplay[],
    serverComment: CommentDisplay,
): CommentDisplay[] {
    return comments.map((comment) => (comment._id === serverComment._id ? serverComment : comment));
}

export function applyCommentDeleteDisposition(
    comments: readonly CommentDisplay[],
    targetId: string,
    disposition: CommentDeleteDisposition,
    tombstone?: CommentDisplay,
): CommentDisplay[] {
    if (disposition === "hard-delete") return comments.filter((comment) => comment._id !== targetId);
    if (!tombstone) return [...comments];
    return replaceCommentWithServerResult(comments, tombstone);
}

export function applyHighlightedCommentDeleteDisposition(
    highlighted: CommentDisplay | undefined,
    targetId: string,
    disposition: CommentDeleteDisposition,
    tombstone?: CommentDisplay,
): CommentDisplay | undefined {
    if (highlighted?._id !== targetId) return highlighted;
    return disposition === "hard-delete" ? undefined : tombstone;
}

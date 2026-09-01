import type { Comment } from "@/models/models";
import { ObjectId } from "mongodb";
import type { CommentDeleteDisposition } from "./comment-delete-access-policy";

export type CommentDto = Pick<
    Comment,
    | "_id"
    | "postId"
    | "parentCommentId"
    | "content"
    | "createdBy"
    | "createdAt"
    | "editedAt"
    | "reactions"
    | "replies"
    | "isDeleted"
>;

export type DeletedCommentDto = CommentDto & { mentions: [] };

type CommentLike = Partial<Record<keyof CommentDto, unknown>>;

function normalizeCommentId(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    return value instanceof ObjectId ? value.toHexString() : undefined;
}

function normalizeReactionCounts(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return {};

    const reactions: Record<string, number> = {};
    for (const [reaction, count] of Object.entries(value)) {
        if (Number.isFinite(count) && Number.isInteger(count) && (count as number) >= 0) {
            Object.defineProperty(reactions, reaction, {
                value: count,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
    }
    return reactions;
}

/**
 * Project a persisted or newly inserted comment onto the ordinary-client DTO.
 * Authorization and mention sanitation deliberately happen at the caller.
 */
export function toCommentDto(input: CommentLike): CommentDto {
    const dto = {
        _id: normalizeCommentId(input._id),
        postId: input.postId,
        parentCommentId: input.parentCommentId,
        content: input.content,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        reactions: normalizeReactionCounts(input.reactions),
        replies: input.replies,
    } as CommentDto;

    if (input.editedAt instanceof Date && !Number.isNaN(input.editedAt.getTime())) dto.editedAt = input.editedAt;
    if (typeof input.isDeleted === "boolean") dto.isDeleted = input.isDeleted;

    return dto;
}

/** A deletion result never exposes mention identities, but makes erasure explicit to browser clients. */
export function toDeletedCommentDto(input: CommentLike): DeletedCommentDto {
    return { ...toCommentDto(input), mentions: [] };
}

export function toCommentDeleteActionSuccess(
    disposition: Exclude<CommentDeleteDisposition, "hard-delete">,
    input: CommentLike,
) {
    return {
        success: true as const,
        message: "Comment deleted successfully",
        disposition,
        comment: toDeletedCommentDto(input),
    };
}

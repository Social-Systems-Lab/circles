import { ObjectId } from "mongodb";
import type { Comment, Event, Feature } from "@/models/models";
import {
    resolveCommentMutationContext,
    type CommentEditAuthorizationDependencies,
    type CommentMutationContext,
} from "./comment-edit-access-policy";
import { normalizeCommentTargetId } from "./comment-semantic-target-policy";
import { getPostModerateFeature } from "./constants";
import { isEventShadowBound } from "./event-shadow-binding-policy";

export const COMMENT_DELETE_UNAVAILABLE_MESSAGE = "Content unavailable";
export type CommentDeleteDisposition = "hard-delete" | "tombstone" | "already-deleted";

export type CommentDeleteAuthorizationDependencies = CommentEditAuthorizationDependencies;

export async function authorizeCommentDelete(
    context: CommentMutationContext,
    actorDid: string,
    dependencies: CommentDeleteAuthorizationDependencies,
): Promise<boolean> {
    try {
        if (context.route.kind === "event") {
            const event = await dependencies.findCurrentEvent(context.route.eventId, actorDid);
            if (!event || normalizeCommentTargetId(event._id) !== context.route.eventId) return false;
            if (!isEventShadowBound(event, context)) return false;
            if (!(await dependencies.canReadCurrentEventHosts(event, actorDid))) return false;
            await dependencies.assertEventHostsWritable(event);
        }

        const circleId = normalizeCommentTargetId(context.circle._id);
        if (!circleId) return false;
        const own =
            context.comment.isDeleted !== true &&
            context.comment.createdBy === actorDid &&
            (await dependencies.authorizeFeature(actorDid, circleId, context.commentFeature));
        if (own) return true;

        const moderateFeature = getPostModerateFeature(context.post.postType);
        return Boolean(
            moderateFeature && (await dependencies.authorizeFeature(actorDid, circleId, moderateFeature as Feature)),
        );
    } catch {
        return false;
    }
}

export type CommentDeletePersistence = {
    hasChild: (normalizedCommentId: string) => Promise<boolean>;
    validateParent: (normalizedParentId: string, normalizedPostId: string) => Promise<boolean>;
    hardDelete: (context: CommentMutationContext) => Promise<boolean>;
    tombstone: (context: CommentMutationContext) => Promise<boolean>;
    cleanupReactions: (normalizedCommentId: string) => Promise<void>;
    decrementPostComments: (normalizedPostId: string) => Promise<void>;
    decrementParentReplies: (normalizedParentId: string) => Promise<void>;
    refreshHighlight: (normalizedPostId: string) => Promise<void>;
};

export type CommentDeleteDerivedEffect = "reactions" | "post-comments" | "parent-replies" | "highlight";

export const commentReactionCleanupFilter = (commentId: string) => ({
    contentId: commentId,
    contentType: "comment" as const,
});
export const postCommentsDecrementFilter = (postId: ObjectId) => ({ _id: postId, comments: { $gt: 0 } });
export const parentRepliesDecrementFilter = (parentId: ObjectId) => ({ _id: parentId, replies: { $gt: 0 } });

const sanitizedTombstone = (comment: Comment): Comment => ({
    ...comment,
    isDeleted: true,
    content: "",
    createdBy: "anonymous",
    reactions: {},
    mentions: [],
});

export type CommentDeleteResult =
    | { ok: false; message: typeof COMMENT_DELETE_UNAVAILABLE_MESSAGE }
    | {
          ok: true;
          disposition: CommentDeleteDisposition;
          context: CommentMutationContext;
          comment?: Comment;
      };

/** Canonical access and authority precede the single-winner primary mutation. */
export async function orchestrateCommentDelete(input: {
    commentId: string;
    actorDid: string;
    resolveContext?: typeof resolveCommentMutationContext;
    authorizationDependencies: CommentDeleteAuthorizationDependencies;
    persistence: CommentDeletePersistence;
    onDerivedEffectError?: (effect: CommentDeleteDerivedEffect, error: unknown) => void;
}): Promise<CommentDeleteResult> {
    const context = await (input.resolveContext ?? resolveCommentMutationContext)(input.commentId, input.actorDid);
    if (!context || !(await authorizeCommentDelete(context, input.actorDid, input.authorizationDependencies))) {
        return { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE };
    }

    if (context.comment.isDeleted === true) {
        return { ok: true, disposition: "already-deleted", context, comment: sanitizedTombstone(context.comment) };
    }

    const hasChild = await input.persistence.hasChild(context.normalizedCommentId);
    if (hasChild) {
        if (!(await input.persistence.tombstone(context))) {
            return { ok: true, disposition: "already-deleted", context, comment: sanitizedTombstone(context.comment) };
        }
        await runDerivedEffect(input, "reactions", () =>
            input.persistence.cleanupReactions(context.normalizedCommentId),
        );
        if (!context.comment.parentCommentId)
            await runDerivedEffect(input, "highlight", () =>
                input.persistence.refreshHighlight(context.normalizedPostId),
            );
        return {
            ok: true,
            disposition: "tombstone",
            context,
            comment: sanitizedTombstone(context.comment),
        };
    }

    const parentId = context.comment.parentCommentId ? normalizeCommentTargetId(context.comment.parentCommentId) : null;
    if (
        context.comment.parentCommentId &&
        (!parentId || !(await input.persistence.validateParent(parentId, context.normalizedPostId)))
    ) {
        return { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE };
    }
    if (!(await input.persistence.hardDelete(context))) {
        return { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE };
    }
    await runDerivedEffect(input, "reactions", () => input.persistence.cleanupReactions(context.normalizedCommentId));
    if (context.route.kind === "generic")
        await runDerivedEffect(input, "post-comments", () =>
            input.persistence.decrementPostComments(context.normalizedPostId),
        );
    if (parentId)
        await runDerivedEffect(input, "parent-replies", () => input.persistence.decrementParentReplies(parentId));
    if (!context.comment.parentCommentId)
        await runDerivedEffect(input, "highlight", () => input.persistence.refreshHighlight(context.normalizedPostId));
    return { ok: true, disposition: "hard-delete", context };
}

async function runDerivedEffect(
    input: { onDerivedEffectError?: (effect: CommentDeleteDerivedEffect, error: unknown) => void },
    effect: CommentDeleteDerivedEffect,
    operation: () => Promise<void>,
): Promise<void> {
    try {
        await operation();
    } catch (error) {
        try {
            (
                input.onDerivedEffectError ??
                ((failedEffect, cause) => console.error("Comment delete cleanup failed", failedEffect, cause))
            )(effect, error);
        } catch (loggingError) {
            console.error("Comment delete cleanup logging failed", effect, loggingError);
        }
    }
}

export const mongoCommentDeletePersistence: CommentDeletePersistence = {
    hasChild: async (commentId) => {
        const { Comments } = await import("./db");
        return Boolean(await Comments.findOne({ parentCommentId: commentId }, { projection: { _id: 1 } }));
    },
    validateParent: async (parentId, postId) => {
        const { Comments } = await import("./db");
        return Boolean(await Comments.findOne({ _id: new ObjectId(parentId), postId }, { projection: { _id: 1 } }));
    },
    hardDelete: async (context) => {
        const { Comments } = await import("./db");
        const result = await Comments.deleteOne({
            _id: new ObjectId(context.normalizedCommentId),
            isDeleted: { $ne: true },
        });
        return result.deletedCount === 1;
    },
    tombstone: async (context) => {
        const { Comments } = await import("./db");
        const result = await Comments.updateOne(
            { _id: new ObjectId(context.normalizedCommentId), isDeleted: { $ne: true } },
            { $set: { isDeleted: true, content: "", createdBy: "anonymous", reactions: {}, mentions: [] } },
        );
        return result.modifiedCount === 1;
    },
    cleanupReactions: async (commentId) => {
        const { Reactions } = await import("./db");
        await Reactions.deleteMany(commentReactionCleanupFilter(commentId));
    },
    decrementPostComments: async (postId) => {
        const { Posts } = await import("./db");
        await Posts.updateOne(postCommentsDecrementFilter(new ObjectId(postId)), { $inc: { comments: -1 } });
    },
    decrementParentReplies: async (parentId) => {
        const { Comments } = await import("./db");
        await Comments.updateOne(parentRepliesDecrementFilter(new ObjectId(parentId)), { $inc: { replies: -1 } });
    },
    refreshHighlight: async (postId) => {
        const { updateHighlightedComment } = await import("./feed");
        await updateHighlightedComment(postId);
    },
};

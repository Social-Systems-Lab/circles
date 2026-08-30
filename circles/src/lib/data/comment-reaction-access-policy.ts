import { ObjectId } from "mongodb";
import type { Comment, Event } from "@/models/models";
import { isEventShadowBound } from "./event-shadow-binding-policy";
import {
    POST_REACTION_UNAVAILABLE_MESSAGE,
    resolvePostReactionContext,
    type PostReactionContext,
} from "./post-reaction-access-policy";

export const COMMENT_REACTION_UNAVAILABLE_MESSAGE = POST_REACTION_UNAVAILABLE_MESSAGE;

export type CommentReactionContext = PostReactionContext & {
    comment: Comment;
    normalizedCommentId: string;
};

export type CommentReactionDependencies = {
    findComment: (commentId: ObjectId) => Promise<Comment | null>;
    resolvePostContext: (postId: string, actorDid: string) => Promise<PostReactionContext | null>;
    findEvent: (eventId: ObjectId) => Promise<Event | null>;
};

const defaultDependencies: CommentReactionDependencies = {
    findComment: async (commentId) => {
        const { Comments } = await import("./db");
        return (await Comments.findOne({ _id: commentId })) as Comment | null;
    },
    resolvePostContext: resolvePostReactionContext,
    findEvent: async (eventId) => {
        const { Events } = await import("./db");
        return (await Events.findOne({ _id: eventId })) as Event | null;
    },
};

const normalizeObjectId = (value: unknown): ObjectId | null =>
    typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;

/** Resolves the canonical, currently reactable Comment and its canonical Post context. */
export async function resolveCommentReactionContext(
    commentId: string,
    actorDid: string,
    dependencies: CommentReactionDependencies = defaultDependencies,
): Promise<CommentReactionContext | null> {
    try {
        const commentObjectId = normalizeObjectId(commentId);
        if (!commentObjectId) return null;
        const normalizedCommentId = commentObjectId.toHexString();

        const comment = await dependencies.findComment(commentObjectId);
        if (!comment || comment._id?.toString() !== normalizedCommentId || comment.isDeleted === true) return null;

        const postObjectId = normalizeObjectId(comment.postId);
        if (!postObjectId) return null;
        const normalizedPostId = postObjectId.toHexString();
        const postContext = await dependencies.resolvePostContext(normalizedPostId, actorDid);
        if (!postContext || postContext.normalizedPostId !== normalizedPostId) return null;

        const { post } = postContext;
        const eventParentId = post.parentItemType === "event" ? normalizeObjectId(post.parentItemId) : null;
        const supportedEventShadowType = post.postType === "event" || post.postType === "discussion";

        // Event Posts are alternate-comment shadows. Legacy Discussion shadows are classified
        // only by their persisted Event parent marker; ordinary Event noticeboard Posts are `post`.
        if (post.postType === "event" && !eventParentId) return null;
        if (eventParentId && !supportedEventShadowType && post.postType !== "post") return null;
        if (eventParentId && supportedEventShadowType) {
            const event = await dependencies.findEvent(eventParentId);
            if (
                !event ||
                event._id?.toString() !== eventParentId.toHexString() ||
                !isEventShadowBound(event, postContext)
            ) {
                return null;
            }
        }

        return {
            ...postContext,
            comment: { ...comment, _id: normalizedCommentId, postId: normalizedPostId },
            normalizedCommentId,
        };
    } catch {
        return null;
    }
}

export async function orchestrateCommentReaction(input: {
    commentId: string;
    actorDid: string;
    resolveContext?: (commentId: string, actorDid: string) => Promise<CommentReactionContext | null>;
    mutate: (context: CommentReactionContext) => Promise<boolean>;
    afterMutation?: (context: CommentReactionContext) => Promise<void>;
}): Promise<{ ok: true; didMutate: boolean; context: CommentReactionContext } | { ok: false; message: string }> {
    const context = await (input.resolveContext ?? resolveCommentReactionContext)(input.commentId, input.actorDid);
    if (!context) return { ok: false, message: COMMENT_REACTION_UNAVAILABLE_MESSAGE };

    const didMutate = await input.mutate(context);
    if (didMutate && input.afterMutation) await input.afterMutation(context);
    return { ok: true, didMutate, context };
}

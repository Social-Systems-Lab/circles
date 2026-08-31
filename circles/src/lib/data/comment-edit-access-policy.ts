import { ObjectId } from "mongodb";
import type { Comment, Event, Feature, Mention } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import {
    normalizeCommentTargetId,
    resolveCommentSemanticTarget,
    type CommentDetailSource,
    type CommentSemanticRoute,
    type CommentSourceType,
} from "./comment-semantic-target-policy";
import { isEventShadowBound } from "./event-shadow-binding-policy";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";
import { canReadEventOwners } from "./post-source-access-policy";

export const COMMENT_EDIT_UNAVAILABLE_MESSAGE = "Content unavailable";

export type CommentMutationContext = ReadablePostContext & {
    comment: Comment;
    normalizedCommentId: string;
    normalizedPostId: string;
    route: CommentSemanticRoute;
    commentFeature: Feature;
};

export type CommentMutationDependencies = {
    findComment: (id: ObjectId) => Promise<Comment | null>;
    resolveReadableContext: typeof resolveReadablePostContext;
    canWriteCircle: typeof canWriteCircleByLifecycle;
    findSource: (type: CommentSourceType, id: ObjectId) => Promise<CommentDetailSource | Event | null>;
};

const findSource = async (type: CommentSourceType, id: ObjectId) => {
    const { Tasks, Goals, Issues, Proposals, Events } = await import("./db");
    return { task: Tasks, goal: Goals, issue: Issues, proposal: Proposals, event: Events }[type].findOne({
        _id: id,
    }) as Promise<CommentDetailSource | Event | null>;
};

const defaultDependencies: CommentMutationDependencies = {
    findComment: async (id) => {
        const { Comments } = await import("./db");
        return Comments.findOne({ _id: id }) as Promise<Comment | null>;
    },
    resolveReadableContext: resolveReadablePostContext,
    canWriteCircle: canWriteCircleByLifecycle,
    findSource,
};

/** Resolves the canonical current mutation target; edit/delete authority stays additive. */
export async function resolveCommentMutationContext(
    commentId: string,
    actorDid: string,
    dependencies: CommentMutationDependencies = defaultDependencies,
): Promise<CommentMutationContext | null> {
    try {
        const normalizedCommentId = normalizeCommentTargetId(commentId);
        if (!normalizedCommentId) return null;
        const comment = await dependencies.findComment(new ObjectId(normalizedCommentId));
        if (!comment || normalizeCommentTargetId(comment._id) !== normalizedCommentId) return null;
        const normalizedPostId = normalizeCommentTargetId(comment.postId);
        if (!normalizedPostId) return null;
        const context = await dependencies.resolveReadableContext(normalizedPostId, actorDid);
        if (!context || normalizeCommentTargetId(context.post._id) !== normalizedPostId) return null;
        if (!dependencies.canWriteCircle(context.circle)) return null;
        const semantic = await resolveCommentSemanticTarget(context, normalizedPostId, dependencies.findSource);
        if (!semantic) return null;
        return {
            ...context,
            comment: { ...comment, _id: normalizedCommentId, postId: normalizedPostId },
            normalizedCommentId,
            normalizedPostId,
            ...semantic,
        } as CommentMutationContext;
    } catch {
        return null;
    }
}

export type CommentEditAuthorizationDependencies = {
    authorizeFeature: (
        actorDid: string,
        circleId: string,
        feature: CommentMutationContext["commentFeature"],
    ) => Promise<boolean>;
    findCurrentEvent: (eventId: string, actorDid: string) => Promise<Event | null>;
    canReadCurrentEventHosts: (event: Pick<Event, "circleId" | "hostCircleIds">, actorDid: string) => Promise<boolean>;
    assertEventHostsWritable: (event: Pick<Event, "circleId" | "hostCircleIds">) => Promise<void>;
};

/** Applies edit-only authority, including a fresh strict Event mutation check. */
export async function authorizeCommentEdit(
    context: CommentMutationContext,
    actorDid: string,
    dependencies: CommentEditAuthorizationDependencies,
): Promise<boolean> {
    try {
        if (context.route.kind === "event") {
            const currentEvent = await dependencies.findCurrentEvent(context.route.eventId, actorDid);
            if (!currentEvent || normalizeCommentTargetId(currentEvent._id) !== context.route.eventId) return false;
            if (!isEventShadowBound(currentEvent, context)) return false;
            if (!(await dependencies.canReadCurrentEventHosts(currentEvent, actorDid))) return false;
            await dependencies.assertEventHostsWritable(currentEvent);
        }
        if (context.comment.createdBy !== actorDid) return false;
        const circleId = normalizeCommentTargetId(context.circle._id);
        if (!circleId || !(await dependencies.authorizeFeature(actorDid, circleId, context.commentFeature)))
            return false;
        if (context.comment.isDeleted === true) return false;
        return true;
    } catch {
        return false;
    }
}

export async function orchestrateCommentEdit<T>(input: {
    commentId: string;
    actorDid: string;
    content: string;
    resolveContext?: typeof resolveCommentMutationContext;
    authorizationDependencies: CommentEditAuthorizationDependencies;
    canonicalize: (
        content: string,
        actorDid: string,
    ) => Promise<{ ok: true; content: string; mentions: Mention[] } | { ok: false; error: string }>;
    update: (context: CommentMutationContext, content: string, mentions: Mention[]) => Promise<T>;
    notify: (updated: T, context: CommentMutationContext, mentions: Mention[]) => Promise<void>;
}): Promise<{ ok: true; value: T; context: CommentMutationContext } | { ok: false; message: string }> {
    const context = await (input.resolveContext ?? resolveCommentMutationContext)(input.commentId, input.actorDid);
    if (!context || !(await authorizeCommentEdit(context, input.actorDid, input.authorizationDependencies))) {
        return { ok: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE };
    }
    const canonical = await input.canonicalize(input.content, input.actorDid);
    if (!canonical.ok) return { ok: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE };
    const value = await input.update(context, canonical.content, canonical.mentions);
    await input.notify(value, context, canonical.mentions);
    return { ok: true, value, context };
}

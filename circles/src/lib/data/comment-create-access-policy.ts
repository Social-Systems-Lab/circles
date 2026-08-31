import { ObjectId } from "mongodb";
import type { Event, Feature } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { features } from "./constants";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";
import {
    normalizeCommentTargetId,
    resolveCommentSemanticTarget,
    type CommentDetailSource,
    type CommentSourceType,
} from "./comment-semantic-target-policy";

export const COMMENT_CREATE_UNAVAILABLE_MESSAGE = "Content unavailable";

type CommentCreateRoute = { kind: "generic" } | { kind: "discussion" } | { kind: "event"; event: Event };

export type CommentCreateContext = ReadablePostContext & {
    normalizedPostId: string;
    commentFeature: Feature;
    route: CommentCreateRoute;
};

export type CommentCreateDependencies = {
    resolveReadableContext: typeof resolveReadablePostContext;
    canWriteCircle: typeof canWriteCircleByLifecycle;
    findSource: (type: CommentSourceType, id: ObjectId) => Promise<CommentDetailSource | Event | null>;
    authorizeFeature: (actorDid: string, circleId: string, feature: Feature) => Promise<boolean>;
};

const defaultDependencies: CommentCreateDependencies = {
    resolveReadableContext: resolveReadablePostContext,
    canWriteCircle: canWriteCircleByLifecycle,
    findSource: async (type, id) => {
        const { Tasks, Goals, Issues, Proposals, Events } = await import("./db");
        return { task: Tasks, goal: Goals, issue: Issues, proposal: Proposals, event: Events }[type].findOne({
            _id: id,
        }) as Promise<CommentDetailSource | Event | null>;
    },
    authorizeFeature: async (actorDid, circleId, feature) => {
        const { isAuthorized } = await import("@/lib/auth/auth");
        return isAuthorized(actorDid, circleId, feature);
    },
};

const normalizeId = normalizeCommentTargetId;

/** Resolves the canonical readable, writable semantic target for browser-facing Comment creation. */
export async function resolveCommentCreateContext(
    postId: string,
    actorDid: string,
    dependencies: CommentCreateDependencies = defaultDependencies,
): Promise<CommentCreateContext | null> {
    try {
        const requestedPostId = normalizeId(postId);
        if (!requestedPostId) return null;
        const context = await dependencies.resolveReadableContext(requestedPostId, actorDid);
        const normalizedPostId = normalizeId(context?.post._id);
        const circleId = normalizeId(context?.circle._id);
        if (
            !context ||
            normalizedPostId !== requestedPostId ||
            !circleId ||
            !dependencies.canWriteCircle(context.circle)
        ) {
            return null;
        }

        const semantic = await resolveCommentSemanticTarget(context, normalizedPostId, dependencies.findSource);
        if (!semantic) return null;
        const { commentFeature } = semantic;
        const route: CommentCreateRoute =
            semantic.route.kind === "event" ? { kind: "event", event: semantic.route.event } : semantic.route;

        if (!commentFeature || !(await dependencies.authorizeFeature(actorDid, circleId, commentFeature))) return null;
        return { ...context, normalizedPostId, commentFeature, route };
    } catch {
        return null;
    }
}

export async function orchestrateCommentCreate<T>(input: {
    postId: string;
    actorDid: string;
    resolveContext?: (postId: string, actorDid: string) => Promise<CommentCreateContext | null>;
    executeGeneric: (context: CommentCreateContext) => Promise<T>;
    executeDiscussion: (context: CommentCreateContext) => Promise<T>;
    executeEvent: (context: CommentCreateContext, event: Event) => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    const context = await (input.resolveContext ?? resolveCommentCreateContext)(input.postId, input.actorDid);
    if (!context) return { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE };
    try {
        const value =
            context.route.kind === "event"
                ? await input.executeEvent(context, context.route.event)
                : context.route.kind === "discussion"
                  ? await input.executeDiscussion(context)
                  : await input.executeGeneric(context);
        return { ok: true, value };
    } catch {
        return { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE };
    }
}

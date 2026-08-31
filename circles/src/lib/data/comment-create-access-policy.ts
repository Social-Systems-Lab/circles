import { ObjectId } from "mongodb";
import type { Event, Feature, Goal, Issue, Proposal, Task } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { features, getPostCommentFeature } from "./constants";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";

export const COMMENT_CREATE_UNAVAILABLE_MESSAGE = "Content unavailable";

type DetailSource = Task | Goal | Issue | Proposal;
type CommentCreateRoute = { kind: "generic" } | { kind: "discussion" } | { kind: "event"; event: Event };

export type CommentCreateContext = ReadablePostContext & {
    normalizedPostId: string;
    commentFeature: Feature;
    route: CommentCreateRoute;
};

export type CommentCreateDependencies = {
    resolveReadableContext: typeof resolveReadablePostContext;
    canWriteCircle: typeof canWriteCircleByLifecycle;
    findSource: (
        type: "task" | "goal" | "issue" | "proposal" | "event",
        id: ObjectId,
    ) => Promise<DetailSource | Event | null>;
    authorizeFeature: (actorDid: string, circleId: string, feature: Feature) => Promise<boolean>;
};

const defaultDependencies: CommentCreateDependencies = {
    resolveReadableContext: resolveReadablePostContext,
    canWriteCircle: canWriteCircleByLifecycle,
    findSource: async (type, id) => {
        const { Tasks, Goals, Issues, Proposals, Events } = await import("./db");
        return { task: Tasks, goal: Goals, issue: Issues, proposal: Proposals, event: Events }[type].findOne({
            _id: id,
        }) as Promise<DetailSource | Event | null>;
    },
    authorizeFeature: async (actorDid, circleId, feature) => {
        const { isAuthorized } = await import("@/lib/auth/auth");
        return isAuthorized(actorDid, circleId, feature);
    },
};

const detailFeatures = {
    task: features.tasks.comment,
    goal: features.goals.comment,
    issue: features.issues.comment,
    // Proposals currently have no configured comment feature; preserve their existing feed permission.
    proposal: features.feed.comment,
} as const;

const normalizeId = (value: unknown) =>
    typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value).toHexString() : null;

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

        let route: CommentCreateRoute = { kind: "generic" };
        let commentFeature = getPostCommentFeature(context.post.postType);

        if (context.post.postType === "discussion" && context.post.parentItemType !== "event") {
            route = { kind: "discussion" };
            commentFeature = features.discussions.comment;
        } else if (context.post.parentItemType === "event") {
            const sourceId = normalizeId(context.post.parentItemId);
            const isAlternate = context.post.postType === "event" || context.post.postType === "discussion";
            if (isAlternate) {
                if (!sourceId) return null;
                const event = (await dependencies.findSource("event", new ObjectId(sourceId))) as Event | null;
                if (
                    !event ||
                    normalizeId(event._id) !== sourceId ||
                    normalizeId(event.commentPostId) !== normalizedPostId
                ) {
                    return null;
                }
                route = { kind: "event", event };
                commentFeature = features.feed.comment;
            } else if (context.post.postType !== "post") {
                return null;
            }
        } else if (
            context.post.parentItemType &&
            ["task", "goal", "issue", "proposal"].includes(context.post.parentItemType) &&
            context.post.postType === context.post.parentItemType
        ) {
            const type = context.post.parentItemType as keyof typeof detailFeatures;
            const sourceId = normalizeId(context.post.parentItemId);
            if (!sourceId) return null;
            const source = await dependencies.findSource(type, new ObjectId(sourceId));
            if (
                !source ||
                normalizeId(source._id) !== sourceId ||
                normalizeId(source.commentPostId) !== normalizedPostId
            ) {
                return null;
            }
            commentFeature = detailFeatures[type];
        }

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

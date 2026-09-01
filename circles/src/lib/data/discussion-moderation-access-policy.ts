import type { Feature, Post } from "@/models/models";
import { ObjectId } from "mongodb";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { features } from "./constants";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";

export const DISCUSSION_MODERATION_UNAVAILABLE_MESSAGE = "Content unavailable";

export type DiscussionModerationContext = ReadablePostContext & { normalizedPostId: string };

type DiscussionModerationDependencies = {
    resolveReadableContext: typeof resolveReadablePostContext;
    canWriteCircle: typeof canWriteCircleByLifecycle;
    authorize: (actorDid: string, circleId: string, feature: Feature) => Promise<boolean>;
};

const defaultDependencies: DiscussionModerationDependencies = {
    resolveReadableContext: resolveReadablePostContext,
    canWriteCircle: canWriteCircleByLifecycle,
    authorize: async (actorDid, circleId, feature) => {
        const { isAuthorized } = await import("@/lib/auth/auth");
        return isAuthorized(actorDid, circleId, feature);
    },
};

const sourceOwnershipFields = [
    "parentItemType",
    "parentItemId",
    "sourceResourceType",
    "sourceResourceId",
] as const satisfies ReadonlyArray<keyof Post>;

export async function resolveDiscussionModerationContext(
    postId: string,
    actorDid: string,
    dependencies: DiscussionModerationDependencies = defaultDependencies,
): Promise<DiscussionModerationContext | null> {
    try {
        const context = await dependencies.resolveReadableContext(postId, actorDid);
        if (!context || context.post.postType !== "discussion") return null;
        if (sourceOwnershipFields.some((field) => field in context.post)) return null;
        if (!dependencies.canWriteCircle(context.circle)) return null;

        const circleId = context.circle._id?.toString();
        const normalizedPostId = context.post._id?.toString();
        const normalizedFeedId = context.feed._id?.toString();
        if (
            !circleId ||
            !normalizedPostId ||
            !normalizedFeedId ||
            !ObjectId.isValid(postId) ||
            !ObjectId.isValid(normalizedPostId) ||
            !ObjectId.isValid(normalizedFeedId) ||
            new ObjectId(postId).toHexString() !== normalizedPostId ||
            context.post.feedId !== normalizedFeedId
        )
            return null;
        if (!(await dependencies.authorize(actorDid, circleId, features.discussions.moderate))) return null;

        return { ...context, normalizedPostId };
    } catch {
        return null;
    }
}

export async function orchestrateDiscussionModeration<T>(input: {
    postId: string;
    actorDid: string;
    resolveContext?: (postId: string, actorDid: string) => Promise<DiscussionModerationContext | null>;
    persist: (normalizedPostId: string) => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    const context = await (input.resolveContext ?? resolveDiscussionModerationContext)(input.postId, input.actorDid);
    if (!context) return { ok: false, message: DISCUSSION_MODERATION_UNAVAILABLE_MESSAGE };
    return { ok: true, value: await input.persist(context.normalizedPostId) };
}

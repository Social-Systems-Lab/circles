import { isAuthorized } from "@/lib/auth/auth";
import type { Feature } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { getPostReactionFeature } from "./constants";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";

export const POST_REACTION_UNAVAILABLE_MESSAGE = "Content unavailable";

export type PostReactionContext = ReadablePostContext & { normalizedPostId: string; reactionFeature: Feature };

type PostReactionDependencies = {
    resolveReadableContext: typeof resolveReadablePostContext;
    canWriteCircle: typeof canWriteCircleByLifecycle;
    getReactionFeature: typeof getPostReactionFeature;
    authorizeFeature: (actorDid: string, circleId: string, feature: Feature) => Promise<boolean>;
};

const defaultDependencies: PostReactionDependencies = {
    resolveReadableContext: resolveReadablePostContext,
    canWriteCircle: canWriteCircleByLifecycle,
    getReactionFeature: getPostReactionFeature,
    authorizeFeature: isAuthorized,
};

/** Resolves the canonical, currently readable and writable target for an ordinary Post reaction. */
export async function resolvePostReactionContext(
    postId: string,
    actorDid: string,
    dependencies: PostReactionDependencies = defaultDependencies,
): Promise<PostReactionContext | null> {
    try {
        const context = await dependencies.resolveReadableContext(postId, actorDid);
        if (!context || !dependencies.canWriteCircle(context.circle)) return null;

        const normalizedPostId = context.post._id?.toString();
        const circleId = context.circle._id?.toString();
        const reactionFeature = dependencies.getReactionFeature(context.post.postType);
        if (!normalizedPostId || !circleId || !reactionFeature) return null;
        if (!(await dependencies.authorizeFeature(actorDid, circleId, reactionFeature))) return null;

        return { ...context, normalizedPostId, reactionFeature };
    } catch {
        return null;
    }
}

export async function orchestratePostReaction(input: {
    postId: string;
    actorDid: string;
    resolveContext?: (postId: string, actorDid: string) => Promise<PostReactionContext | null>;
    mutate: (context: PostReactionContext) => Promise<boolean>;
    afterMutation?: (context: PostReactionContext) => Promise<void>;
}): Promise<{ ok: true; didMutate: boolean; context: PostReactionContext } | { ok: false; message: string }> {
    const context = await (input.resolveContext ?? resolvePostReactionContext)(input.postId, input.actorDid);
    if (!context) return { ok: false, message: POST_REACTION_UNAVAILABLE_MESSAGE };

    const didMutate = await input.mutate(context);
    if (didMutate && input.afterMutation) await input.afterMutation(context);
    return { ok: true, didMutate, context };
}

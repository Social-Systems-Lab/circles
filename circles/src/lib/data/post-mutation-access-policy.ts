import type { ReadablePostContext } from "./post-access-policy";
import { resolveReadablePostContext } from "./post-access-policy";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { getPostSourceReference, type PostSourceReference } from "./post-source-access-policy";
import { POST_UNAVAILABLE_MESSAGE } from "./post-access-policy";

export type PostMutationContext = ReadablePostContext & {
    normalizedPostId: string;
    sourceReference: PostSourceReference | null;
};

type PostMutationDependencies = {
    resolveReadableContext: typeof resolveReadablePostContext;
    canWriteCircle: typeof canWriteCircleByLifecycle;
    classifySource: typeof getPostSourceReference;
};

const defaultDependencies: PostMutationDependencies = {
    resolveReadableContext: resolveReadablePostContext,
    canWriteCircle: canWriteCircleByLifecycle,
    classifySource: getPostSourceReference,
};

/**
 * Resolves the canonical, currently readable target for an ordinary client Post edit.
 * Source-owned Posts intentionally remain writable only through their trusted server workflows.
 */
export async function resolvePostMutationContext(
    postId: string,
    actorDid: string,
    dependencies: PostMutationDependencies = defaultDependencies,
): Promise<PostMutationContext | null> {
    try {
        const context = await dependencies.resolveReadableContext(postId, actorDid);
        if (!context || !dependencies.canWriteCircle(context.circle)) return null;

        const sourceReference = dependencies.classifySource(context.post);
        if (sourceReference === false || sourceReference !== null) return null;

        const normalizedPostId = context.post._id?.toString();
        if (!normalizedPostId) return null;
        return { ...context, normalizedPostId, sourceReference };
    } catch {
        return null;
    }
}

export type OrdinaryPostEditAuthorization = { ok: true } | { ok: false; message: string };

export async function orchestrateOrdinaryPostEdit<T>(input: {
    postId: string;
    actorDid: string;
    submittedCircleId?: string;
    resolveMutationContext?: (postId: string, actorDid: string) => Promise<PostMutationContext | null>;
    authorize: (context: PostMutationContext) => Promise<OrdinaryPostEditAuthorization>;
    execute: (context: PostMutationContext) => Promise<T>;
}): Promise<{ ok: true; value: T; context: PostMutationContext } | { ok: false; message: string }> {
    const context = await (input.resolveMutationContext ?? resolvePostMutationContext)(input.postId, input.actorDid);
    if (!context || (input.submittedCircleId && context.feed.circleId !== input.submittedCircleId)) {
        return { ok: false, message: POST_UNAVAILABLE_MESSAGE };
    }

    const authorization = await input.authorize(context);
    if (!authorization.ok) return authorization;

    return { ok: true, value: await input.execute(context), context };
}

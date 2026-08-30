import { ObjectId } from "mongodb";
import { POST_UNAVAILABLE_MESSAGE } from "./post-access-policy";
import { resolvePostMutationContext, type PostMutationContext } from "./post-mutation-access-policy";

export type PostDeleteContext = PostMutationContext;

type PostDeleteDependencies = {
    resolveMutationContext: typeof resolvePostMutationContext;
    isTaskNoticeboardPost: (postId: string) => Promise<boolean>;
};

type TaskNoticeboardLookupDependencies = {
    findTask: (query: { noticeboardPostId: string }) => Promise<{ _id?: unknown } | null>;
};

const defaultTaskNoticeboardLookupDependencies: TaskNoticeboardLookupDependencies = {
    findTask: async (query) => {
        const { Tasks } = await import("./db");
        return Tasks.findOne(query, { projection: { _id: 1 } });
    },
};

/** Delete-only reverse ownership check for legacy Shift noticeboard Posts. */
export async function isTaskNoticeboardPost(
    postId: string,
    dependencies: TaskNoticeboardLookupDependencies = defaultTaskNoticeboardLookupDependencies,
): Promise<boolean> {
    if (!ObjectId.isValid(postId)) return false;
    return Boolean(await dependencies.findTask({ noticeboardPostId: new ObjectId(postId).toHexString() }));
}

const defaultDependencies: PostDeleteDependencies = {
    resolveMutationContext: resolvePostMutationContext,
    isTaskNoticeboardPost,
};

/** Resolves a canonical, currently readable and writable ordinary Post delete target. */
export async function resolvePostDeleteContext(
    postId: string,
    actorDid: string,
    dependencies: PostDeleteDependencies = defaultDependencies,
): Promise<PostDeleteContext | null> {
    try {
        const context = await dependencies.resolveMutationContext(postId, actorDid);
        if (!context || (await dependencies.isTaskNoticeboardPost(context.normalizedPostId))) return null;
        return context;
    } catch {
        return null;
    }
}

export async function orchestrateOrdinaryPostDelete(input: {
    postId: string;
    actorDid: string;
    resolveDeleteContext?: (postId: string, actorDid: string) => Promise<PostDeleteContext | null>;
    authorize: (context: PostDeleteContext) => Promise<{ ok: boolean }>;
    executeDelete: (context: PostDeleteContext) => Promise<void>;
    revalidate: (context: PostDeleteContext) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const context = await (input.resolveDeleteContext ?? resolvePostDeleteContext)(input.postId, input.actorDid);
    if (!context) return { ok: false, message: POST_UNAVAILABLE_MESSAGE };

    const authorization = await input.authorize(context);
    if (!authorization.ok) return { ok: false, message: POST_UNAVAILABLE_MESSAGE };

    await input.executeDelete(context);
    await input.revalidate(context);
    return { ok: true };
}

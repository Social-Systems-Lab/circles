import type { Comment, Mention } from "@/models/models";
import { ObjectId } from "mongodb";
import { canonicalizeCircleMentionsForWrite, type CircleMentionWriteResult } from "./circle-mention-write-policy";

export const COMMENT_TARGET_UNAVAILABLE = "Comment target unavailable.";

export type SafeAuthoredCommentInput = {
    content: string;
    parentCommentId: string | null;
    mentions: Mention[];
};

export type AuthoredCommentRequest = {
    content: string;
    parentCommentId?: string | null;
};

export type PrepareAuthoredCommentDependencies = {
    canonicalize?: (content: string, writerDid: string) => Promise<CircleMentionWriteResult>;
    findParentComment: (id: ObjectId) => Promise<Pick<Comment, "postId"> | null>;
};

export async function prepareAuthoredComment(input: {
    postId: string;
    parentCommentId?: string | null;
    content: string;
    writerDid: string;
    dependencies: PrepareAuthoredCommentDependencies;
}): Promise<SafeAuthoredCommentInput> {
    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId) {
        if (!ObjectId.isValid(parentCommentId)) throw new Error(COMMENT_TARGET_UNAVAILABLE);
        const normalizedParentId = new ObjectId(parentCommentId).toHexString();
        const parent = await input.dependencies.findParentComment(new ObjectId(normalizedParentId));
        if (!parent || !ObjectId.isValid(String(parent.postId))) throw new Error(COMMENT_TARGET_UNAVAILABLE);
        if (new ObjectId(String(parent.postId)).toHexString() !== new ObjectId(input.postId).toHexString()) {
            throw new Error(COMMENT_TARGET_UNAVAILABLE);
        }
    }

    const canonical = await (input.dependencies.canonicalize ?? canonicalizeCircleMentionsForWrite)(
        input.content,
        input.writerDid,
    );
    if (!canonical.ok) throw new Error(canonical.error);

    return { content: canonical.content, mentions: canonical.mentions, parentCommentId };
}

export async function orchestrateAuthoredCommentCreate<T>(input: {
    postId: string;
    parentCommentId?: string | null;
    content: string;
    writerDid: string;
    dependencies: PrepareAuthoredCommentDependencies & {
        insert: (prepared: SafeAuthoredCommentInput, canonicalPostId: string) => Promise<T>;
        incrementParentReplies: (parentCommentId: string) => Promise<void>;
        notify: (inserted: T, prepared: SafeAuthoredCommentInput) => Promise<void>;
    };
}): Promise<{ inserted: T; prepared: SafeAuthoredCommentInput }> {
    const prepared = await prepareAuthoredComment(input);
    const inserted = await input.dependencies.insert(prepared, input.postId);
    if (prepared.parentCommentId) await input.dependencies.incrementParentReplies(prepared.parentCommentId);
    await input.dependencies.notify(inserted, prepared);
    return { inserted, prepared };
}

export async function orchestrateAuthoredCommentEdit<T>(input: {
    postId: string;
    content: string;
    writerDid: string;
    dependencies: Pick<PrepareAuthoredCommentDependencies, "canonicalize"> & {
        update: (content: string, mentions: Mention[]) => Promise<T>;
        notify: (updated: T, mentions: Mention[]) => Promise<void>;
    };
}): Promise<T> {
    const canonical = await (input.dependencies.canonicalize ?? canonicalizeCircleMentionsForWrite)(
        input.content,
        input.writerDid,
    );
    if (!canonical.ok) throw new Error(canonical.error);
    const updated = await input.dependencies.update(canonical.content, canonical.mentions);
    await input.dependencies.notify(updated, canonical.mentions);
    return updated;
}

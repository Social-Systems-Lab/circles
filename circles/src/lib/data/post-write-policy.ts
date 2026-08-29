import type { Mention, Post } from "@/models/models";
import { getPostTitleUpdate } from "./post-content-policy";
import { canonicalizeCircleMentionsForWrite, type CircleMentionWriteResult } from "./circle-mention-write-policy";
import {
    PREVIEW_UNAVAILABLE,
    type CanonicalInternalPreview,
    type InternalPreviewUpdate,
} from "./internal-preview-write-policy";
import { ORIGINAL_POST_UNAVAILABLE } from "./shared-original-write-policy";

export const POST_WRITE_UNAVAILABLE = "One or more references are unavailable.";

export function buildMainPostUpdateBaseDocument(
    formData: FormData,
    post: Pick<Post, "_id" | "postType">,
): Partial<Post> {
    const title = formData.get("title") as string | null;
    const locationStr = formData.get("location") as string | null;
    const linkPreviewImageUrl = formData.get("linkPreviewImageUrl") as string | null;
    const sdgsStr = formData.get("sdgs") as string | null;
    return {
        _id: post._id,
        ...getPostTitleUpdate(post.postType, title),
        editedAt: new Date(),
        location: locationStr ? JSON.parse(locationStr) : undefined,
        linkPreviewUrl: (formData.get("linkPreviewUrl") as string | null) || undefined,
        linkPreviewTitle: (formData.get("linkPreviewTitle") as string | null) || undefined,
        linkPreviewDescription: (formData.get("linkPreviewDescription") as string | null) || undefined,
        linkPreviewImage: linkPreviewImageUrl ? { url: linkPreviewImageUrl } : undefined,
        sdgs: sdgsStr ? JSON.parse(sdgsStr) : undefined,
    };
}

const CLIENT_CREATABLE_POST_TYPES = new Set(["post", "community", "discussion"]);

export function isClientCreatablePostType(postType: string | undefined): boolean {
    return postType === undefined || CLIENT_CREATABLE_POST_TYPES.has(postType);
}

export async function resolvePostContentForWrite(
    content: string,
    writerDid: string,
    canonicalize: (
        content: string,
        writerDid: string,
    ) => Promise<CircleMentionWriteResult> = canonicalizeCircleMentionsForWrite,
): Promise<CircleMentionWriteResult> {
    return canonicalize(content, writerDid);
}

type CanonicalPostWrite = Extract<CircleMentionWriteResult, { ok: true }>;

export async function prepareMainPostCreate(input: {
    postType: string | undefined;
    content: string;
    writerDid: string;
    authorizeTarget: () => Promise<boolean>;
    resolve?: typeof resolvePostContentForWrite;
    validateShare?: () => Promise<boolean>;
}): Promise<
    | { ok: true; write: CanonicalPostWrite }
    | { ok: false; error: string; reason: "target" | "postType" | "mention" | "share" }
> {
    if (!(await input.authorizeTarget())) return { ok: false, error: "Not authorized", reason: "target" };
    if (!isClientCreatablePostType(input.postType)) {
        return { ok: false, error: POST_WRITE_UNAVAILABLE, reason: "postType" };
    }
    const write = await (input.resolve || resolvePostContentForWrite)(input.content, input.writerDid);
    if (!write.ok) return { ok: false, error: write.error, reason: "mention" };
    if (input.validateShare && !(await input.validateShare())) {
        return { ok: false, error: "Original post unavailable.", reason: "share" };
    }
    return { ok: true, write };
}

export async function prepareMainPostUpdate(input: {
    content: string;
    storedContent: string;
    storedMentions: Mention[];
    writerDid: string;
    resolve?: typeof resolvePostContentForWrite;
}): Promise<{ ok: true; content: string; mentions: Mention[]; changed: boolean } | { ok: false; error: string }> {
    if (input.content === input.storedContent) {
        return { ok: true, content: input.storedContent, mentions: input.storedMentions, changed: false };
    }
    const write = await (input.resolve || resolvePostContentForWrite)(input.content, input.writerDid);
    if (!write.ok) return write;
    return { ok: true, content: write.content, mentions: write.mentions, changed: true };
}

export async function orchestrateMainPostCreate<TDocument extends Partial<Post>, TValue>(input: {
    postType: string | undefined;
    content: string;
    writerDid: string;
    authorizeTarget: () => Promise<boolean>;
    isAllowedPostType?: typeof isClientCreatablePostType;
    resolve?: typeof resolvePostContentForWrite;
    resolveShare?: () => Promise<string>;
    resolvePreview?: () => Promise<CanonicalInternalPreview | null>;
    buildDocument: (
        write: CanonicalPostWrite,
        preview: CanonicalInternalPreview | null,
        sharedPostId: string | undefined,
    ) => Promise<TDocument>;
    persistAndPublishVector: (document: TDocument) => Promise<TValue>;
    upload: (value: TValue) => Promise<void>;
    notify: (value: TValue, mentions: Mention[]) => Promise<void>;
}): Promise<
    | { ok: true; value: TValue; document: TDocument; write: CanonicalPostWrite }
    | { ok: false; error: string; reason: "target" | "postType" | "mention" | "share" | "preview" }
> {
    if (!(await input.authorizeTarget())) return { ok: false, error: "Not authorized", reason: "target" };
    if (!(input.isAllowedPostType || isClientCreatablePostType)(input.postType)) {
        return { ok: false, error: POST_WRITE_UNAVAILABLE, reason: "postType" };
    }
    const write = await (input.resolve || resolvePostContentForWrite)(input.content, input.writerDid);
    if (!write.ok) return { ok: false, error: write.error, reason: "mention" };
    let sharedPostId: string | undefined;
    try {
        sharedPostId = input.resolveShare ? await input.resolveShare() : undefined;
    } catch {
        return { ok: false, error: ORIGINAL_POST_UNAVAILABLE, reason: "share" };
    }
    let preview: CanonicalInternalPreview | null = null;
    try {
        preview = input.resolvePreview ? await input.resolvePreview() : null;
    } catch {
        return { ok: false, error: PREVIEW_UNAVAILABLE, reason: "preview" };
    }

    const baseDocument = await input.buildDocument(write, preview, sharedPostId);
    const document = {
        ...baseDocument,
        content: write.content,
        mentions: write.mentions,
    } as TDocument;
    const value = await input.persistAndPublishVector(document);
    await input.upload(value);
    await input.notify(value, write.mentions);
    return { ok: true, value, document, write };
}

export async function orchestrateMainPostUpdate<TDocument extends Partial<Post>, TUpload, TValue>(input: {
    content: string;
    storedContent: string;
    storedMentions: Mention[];
    writerDid: string;
    baseUpdate: TDocument;
    resolve?: typeof resolvePostContentForWrite;
    resolvePreview?: () => Promise<InternalPreviewUpdate>;
    upload: (write: { content: string; mentions: Mention[]; changed: boolean }) => Promise<TUpload>;
    applyUpload: (document: TDocument, upload: TUpload) => void;
    persistAndPublishVector: (document: TDocument) => Promise<TValue>;
    notify: (value: TValue, document: TDocument, mentions: Mention[]) => Promise<void>;
}): Promise<{ ok: true; value: TValue; document: TDocument; changed: boolean } | { ok: false; error: string }> {
    const write = await prepareMainPostUpdate(input);
    if (!write.ok) return write;

    let preview: InternalPreviewUpdate = { mode: "preserve" };
    try {
        if (input.resolvePreview) preview = await input.resolvePreview();
    } catch {
        return { ok: false, error: PREVIEW_UNAVAILABLE };
    }

    const document = {
        ...input.baseUpdate,
        content: write.content,
        mentions: write.mentions,
    } as TDocument;
    if (preview.mode === "set" || (preview.mode === "preserve" && preview.preview)) {
        Object.assign(document, preview.preview, { internalPreviewData: undefined });
    } else if (preview.mode === "remove") {
        Object.assign(document, {
            internalPreviewType: undefined,
            internalPreviewId: undefined,
            internalPreviewUrl: undefined,
            internalPreviewData: undefined,
        });
    }
    const upload = await input.upload(write);
    input.applyUpload(document, upload);
    const value = await input.persistAndPublishVector(document);
    await input.notify(value, document, write.mentions);
    return { ok: true, value, document, changed: write.changed };
}

export type AlternateDiscussionAuthoredFields = Pick<Post, "title" | "content" | "location" | "media">;

export function buildAlternateDiscussionCreatePayload(input: Partial<Post>): AlternateDiscussionAuthoredFields {
    return {
        title: typeof input.title === "string" ? input.title : undefined,
        content: typeof input.content === "string" ? input.content : "",
        location: input.location,
        media: undefined,
    };
}

export function buildCanonicalDiscussionDocument(input: {
    authored: AlternateDiscussionAuthoredFields;
    canonicalContent: string;
    mentions: Mention[];
    feedId: string;
    circleId: string;
    writerDid: string;
}): Partial<Post> & { circleId: string } {
    return {
        ...input.authored,
        content: input.canonicalContent,
        mentions: input.mentions,
        feedId: input.feedId,
        circleId: input.circleId,
        createdBy: input.writerDid,
        postType: "discussion",
    };
}

export async function prepareAlternateDiscussionCreate(input: {
    raw: Partial<Post>;
    writerDid: string;
    feedId: string;
    circleId: string;
    resolve?: typeof resolvePostContentForWrite;
}): Promise<
    | { ok: true; authored: AlternateDiscussionAuthoredFields; document: Partial<Post> & { circleId: string } }
    | { ok: false; error: string }
> {
    const prepared = await prepareAlternateDiscussionAuthoredWrite(input);
    if (!prepared.ok) return prepared;
    const { authored, write } = prepared;
    return {
        ok: true,
        authored,
        document: buildCanonicalDiscussionDocument({
            authored,
            canonicalContent: write.content,
            mentions: write.mentions,
            feedId: input.feedId,
            circleId: input.circleId,
            writerDid: input.writerDid,
        }),
    };
}

export async function prepareAlternateDiscussionAuthoredWrite(input: {
    raw: Partial<Post>;
    writerDid: string;
    resolve?: typeof resolvePostContentForWrite;
}): Promise<
    { ok: true; authored: AlternateDiscussionAuthoredFields; write: CanonicalPostWrite } | { ok: false; error: string }
> {
    const authored = buildAlternateDiscussionCreatePayload(input.raw);
    const write = await (input.resolve || resolvePostContentForWrite)(authored.content || "", input.writerDid);
    if (!write.ok) return write;
    return { ok: true, authored, write };
}

export async function orchestrateAlternateDiscussionCreate<TTarget, TValue>(input: {
    raw: Partial<Post>;
    writerDid: string;
    resolveTarget: () => Promise<TTarget | null>;
    canReadTarget: (target: TTarget) => Promise<boolean>;
    authorizeFeature: (target: TTarget) => Promise<boolean>;
    resolve?: typeof resolvePostContentForWrite;
    upload: (authored: AlternateDiscussionAuthoredFields, target: TTarget) => Promise<void>;
    resolveDestination: (target: TTarget) => Promise<{ feedId: string; circleId: string } | null>;
    persistAndPublishVector: (document: Partial<Post> & { circleId: string }) => Promise<TValue>;
}): Promise<
    | { ok: true; value: TValue; document: Partial<Post> & { circleId: string } }
    | { ok: false; error: string; reason: "target" | "feature" | "mention" | "destination" }
> {
    const target = await input.resolveTarget();
    if (!target || !(await input.canReadTarget(target))) {
        return { ok: false, error: "Circle not found", reason: "target" };
    }
    if (!(await input.authorizeFeature(target))) {
        return { ok: false, error: "Not authorized to create forum posts", reason: "feature" };
    }

    const prepared = await prepareAlternateDiscussionAuthoredWrite(input);
    if (!prepared.ok) return { ok: false, error: prepared.error, reason: "mention" };
    await input.upload(prepared.authored, target);

    const destination = await input.resolveDestination(target);
    if (!destination) return { ok: false, error: "Circle not found", reason: "destination" };
    const document = buildCanonicalDiscussionDocument({
        authored: prepared.authored,
        canonicalContent: prepared.write.content,
        mentions: prepared.write.mentions,
        feedId: destination.feedId,
        circleId: destination.circleId,
        writerDid: input.writerDid,
    });
    const value = await input.persistAndPublishVector(document);
    return { ok: true, value, document };
}

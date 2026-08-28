import {
    INTERNAL_PREVIEW_TYPES,
    resolveInternalPreviewUrl,
    type InternalPreviewType,
    type ResolvedInternalPreview,
} from "./post-nested-content-policy";
import { ObjectId } from "mongodb";

export const PREVIEW_UNAVAILABLE = "Preview unavailable";

export type InternalPreviewWriteRequest = {
    type?: string | null;
    id?: string | null;
    url?: string | null;
};

export type InternalPreviewRequestPresence = {
    type: boolean;
    id: boolean;
    url: boolean;
};

export type CanonicalInternalPreview = {
    internalPreviewType: InternalPreviewType;
    internalPreviewId: string;
    internalPreviewUrl: string;
};

export type InternalPreviewUpdate =
    | { mode: "preserve"; preview?: CanonicalInternalPreview }
    | { mode: "remove" }
    | { mode: "set"; preview: CanonicalInternalPreview };

type ResolvePreview = (url: string, viewerDid: string) => Promise<ResolvedInternalPreview | null>;

function isSupportedType(value: string): value is InternalPreviewType {
    return INTERNAL_PREVIEW_TYPES.includes(value as InternalPreviewType);
}

function resolverProbe(type: InternalPreviewType, id: string): string {
    if (type === "circle") return `/circles/${encodeURIComponent(id)}`;
    const segment = type === "post" ? "post" : type === "task" ? "tasks" : `${type}s`;
    return `/circles/_/${segment}/${encodeURIComponent(id)}`;
}

function normalizeCandidateId(type: InternalPreviewType, id: string): string {
    if (type === "circle") return id;
    if (!ObjectId.isValid(id) || !/^[a-fA-F0-9]{24}$/.test(id)) throw new Error(PREVIEW_UNAVAILABLE);
    return new ObjectId(id).toHexString();
}

export async function resolveInternalPreviewForWrite(
    request: InternalPreviewWriteRequest,
    writerDid: string,
    resolvePreview: ResolvePreview = resolveInternalPreviewUrl,
): Promise<CanonicalInternalPreview | null> {
    const type = request.type?.trim() || "";
    const rawId = request.id?.trim() || "";
    const requested = Boolean(type || rawId || request.url);
    if (!requested) return null;
    if (!type || !rawId || !isSupportedType(type)) throw new Error(PREVIEW_UNAVAILABLE);
    const id = normalizeCandidateId(type, rawId);

    const resolved = await resolvePreview(resolverProbe(type, id), writerDid);
    if (!resolved || resolved.type !== type || resolved.id !== id) throw new Error(PREVIEW_UNAVAILABLE);
    return {
        internalPreviewType: resolved.type,
        internalPreviewId: resolved.id,
        internalPreviewUrl: resolved.url,
    };
}

export async function resolveInternalPreviewUpdateForWrite(input: {
    request: InternalPreviewWriteRequest;
    presence: InternalPreviewRequestPresence;
    stored: Partial<CanonicalInternalPreview>;
    writerDid: string;
    resolvePreview?: ResolvePreview;
}): Promise<InternalPreviewUpdate> {
    const presentCount = Number(input.presence.type) + Number(input.presence.id) + Number(input.presence.url);
    if (presentCount === 0) return { mode: "preserve" };
    if (presentCount !== 3) throw new Error(PREVIEW_UNAVAILABLE);

    const type = input.request.type?.trim() || "";
    const rawId = input.request.id?.trim() || "";
    const url = input.request.url?.trim() || "";
    const populatedCount = Number(Boolean(type)) + Number(Boolean(rawId)) + Number(Boolean(url));
    if (populatedCount === 0) return { mode: "remove" };
    if (populatedCount !== 3 || !isSupportedType(type)) throw new Error(PREVIEW_UNAVAILABLE);
    const id = normalizeCandidateId(type, rawId);

    if (
        type === input.stored.internalPreviewType &&
        id === input.stored.internalPreviewId &&
        input.stored.internalPreviewUrl
    ) {
        return {
            mode: "preserve",
            preview: {
                internalPreviewType: type,
                internalPreviewId: id,
                internalPreviewUrl: input.stored.internalPreviewUrl,
            },
        };
    }

    const preview = await resolveInternalPreviewForWrite(
        { type, id, url },
        input.writerDid,
        input.resolvePreview ?? resolveInternalPreviewUrl,
    );
    if (!preview) throw new Error(PREVIEW_UNAVAILABLE);
    return { mode: "set", preview };
}

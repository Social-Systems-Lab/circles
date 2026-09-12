import { ObjectId } from "mongodb";
import type { Circle, PrivateMedia } from "@/models/models";
import { getCircleVisibility } from "@/lib/data/circle-visibility-policy";
import { canWriteCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { getMember } from "@/lib/data/member";
import { deleteFile, saveFile, type FileInfo } from "@/lib/data/storage";
import {
    deleteCirclePrivateFile,
    parsePrivateMediaUrl,
    PRIVATE_MEDIA_PATH_PREFIX,
    savePrivateFile,
} from "@/lib/data/private-media";

export type CircleMediaResourceType = Exclude<PrivateMedia["resourceType"], "chat-message">;

export type SaveCircleOwnedFileInput = {
    actorDid: string;
    ownerCircle: Circle;
    file: Parameters<typeof saveFile>[0];
    fileName: string;
    overwrite: boolean;
    resourceType: CircleMediaResourceType;
    resourceId?: string;
};

type SaveDependencies = {
    isMember: (actorDid: string, circleId: string) => Promise<boolean>;
    savePublic: typeof saveFile;
    savePrivate: typeof savePrivateFile;
};

const defaultSaveDependencies: SaveDependencies = {
    isMember: async (actorDid, circleId) => Boolean(await getMember(actorDid, circleId)),
    savePublic: saveFile,
    savePrivate: savePrivateFile,
};

export async function saveCircleOwnedFile(
    input: SaveCircleOwnedFileInput,
    dependencies: SaveDependencies = defaultSaveDependencies,
): Promise<FileInfo> {
    const circleId = input.ownerCircle._id?.toString();
    if (!input.actorDid || !circleId || !ObjectId.isValid(circleId)) throw new Error("Invalid Circle media owner.");
    if (input.ownerCircle.circleType === "user" && input.ownerCircle.visibility === "secret") {
        throw new Error("User profile circles cannot be secret.");
    }
    if (!canWriteCircleByLifecycle(input.ownerCircle)) {
        throw new Error("Circle changes are unavailable while the circle is paused or unavailable.");
    }

    if (getCircleVisibility(input.ownerCircle) !== "secret") {
        return dependencies.savePublic(input.file, input.fileName, circleId, input.overwrite);
    }
    if (!(await dependencies.isMember(input.actorDid, circleId))) {
        throw new Error("Circle media is unavailable.");
    }

    const saved = await dependencies.savePrivate({
        ownerType: "circle",
        circleId,
        file: input.file,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        uploadedByDid: input.actorDid,
        originalName: typeof input.file?.name === "string" ? input.file.name : undefined,
        contentType: typeof input.file?.type === "string" ? input.file.type : undefined,
    });
    if (!saved.url.startsWith(PRIVATE_MEDIA_PATH_PREFIX)) throw new Error("Invalid private media response.");
    return { originalName: saved.originalName || "unknown", fileName: saved.mediaId, url: saved.url };
}

export type OwnedMediaKind = "public" | "private" | "external";

export function classifyOwnedMediaUrl(url: string): { kind: OwnedMediaKind; mediaId?: string } {
    const privateMediaId = parsePrivateMediaUrl(url);
    if (privateMediaId) return { kind: "private", mediaId: privateMediaId };
    if (!url.includes("?") && !url.includes("#") && (url.startsWith("/storage/") || url.startsWith("/uploads/")))
        return { kind: "public" };
    try {
        const parsed = new URL(url);
        const configured = process.env.CIRCLES_URL ? new URL(process.env.CIRCLES_URL).host : "kamooni.org";
        if (
            parsed.host === configured &&
            !parsed.search &&
            !parsed.hash &&
            (parsed.pathname.startsWith("/storage/") || parsed.pathname.startsWith("/uploads/"))
        ) {
            return { kind: "public" };
        }
    } catch {
        // Non-URL strings are external/unowned.
    }
    return { kind: "external" };
}

export type CircleMediaCleanupResult = { status: "complete" | "not-needed" } | { status: "failed"; error: unknown };

type MediaUrlValue = { url?: unknown } | string | null | undefined;

const getMediaUrl = (value: MediaUrlValue): string | undefined => {
    if (typeof value === "string") return value || undefined;
    return value && typeof value.url === "string" && value.url ? value.url : undefined;
};

export function collectReplacedCircleMedia(oldValue: MediaUrlValue, newValue: MediaUrlValue): string[] {
    const oldUrl = getMediaUrl(oldValue);
    return oldUrl && oldUrl !== getMediaUrl(newValue) ? [oldUrl] : [];
}

export function canRetainSubmittedCircleMediaUrl(circle: Circle, url: string): boolean {
    if (!parsePrivateMediaUrl(url)) return true;
    const circleWithCover = circle as Circle & { cover?: MediaUrlValue };
    const persistedUrls = new Set(
        [
            getMediaUrl(circle.picture),
            getMediaUrl(circleWithCover.cover),
            ...(circle.images?.map((media) => media.fileInfo.url) ?? []),
        ].filter((value): value is string => Boolean(value)),
    );
    return persistedUrls.has(url);
}

export async function cleanupCircleOwnedMedia(
    urls: readonly string[],
    expectedCircleId: string,
    deleteOwned: (input: DeleteCircleOwnedMediaInput) => Promise<void> = deleteCircleOwnedMedia,
): Promise<CircleMediaCleanupResult> {
    if (urls.length === 0) return { status: "not-needed" };
    try {
        await Promise.all(urls.map((url) => deleteOwned({ url, expectedCircleId })));
        return { status: "complete" };
    } catch (error) {
        return { status: "failed", error };
    }
}

export async function persistCircleThenCleanupMedia(
    persist: () => Promise<void>,
    urls: readonly string[],
    expectedCircleId: string,
    cleanup: (
        urls: readonly string[],
        expectedCircleId: string,
    ) => Promise<CircleMediaCleanupResult> = cleanupCircleOwnedMedia,
): Promise<CircleMediaCleanupResult> {
    await persist();
    return cleanup([...new Set(urls)], expectedCircleId);
}

export type CleanupBeforeDeleteResult =
    | { status: "success" }
    | { status: "cleanup-failed"; error: unknown }
    | { status: "source-delete-failed" };

export async function cleanupMediaBeforeSourceDelete(
    urls: readonly string[],
    expectedCircleId: string,
    deleteSource: () => Promise<boolean>,
    cleanup: (
        urls: readonly string[],
        expectedCircleId: string,
    ) => Promise<CircleMediaCleanupResult> = cleanupCircleOwnedMedia,
): Promise<CleanupBeforeDeleteResult> {
    const cleanupResult = await cleanup(urls, expectedCircleId);
    if (cleanupResult.status === "failed") return { status: "cleanup-failed", error: cleanupResult.error };
    return (await deleteSource()) ? { status: "success" } : { status: "source-delete-failed" };
}

export type FundingPostMutationResult = {
    noticeboardSyncFailed: boolean;
    mediaCleanupFailed: boolean;
};

export function getFundingPostMutationMessage(result: FundingPostMutationResult, successMessage: string): string {
    if (result.noticeboardSyncFailed && result.mediaCleanupFailed)
        return "The update was saved, but Noticeboard synchronization and old media cleanup did not complete.";
    if (result.noticeboardSyncFailed) return "Funding request updated, but Noticeboard post could not be created.";
    if (result.mediaCleanupFailed) return "The update was saved, but old media cleanup did not complete.";
    return successMessage;
}

export async function completeFundingPostMutation(
    urls: readonly string[],
    expectedCircleId: string,
    synchronizeNoticeboard: () => Promise<void>,
    cleanup: (
        urls: readonly string[],
        expectedCircleId: string,
    ) => Promise<CircleMediaCleanupResult> = cleanupCircleOwnedMedia,
): Promise<FundingPostMutationResult> {
    const cleanupResult = urls.length > 0 ? await cleanup(urls, expectedCircleId) : ({ status: "not-needed" } as const);
    let noticeboardSyncFailed = false;
    try {
        await synchronizeNoticeboard();
    } catch {
        noticeboardSyncFailed = true;
    }
    return { noticeboardSyncFailed, mediaCleanupFailed: cleanupResult.status === "failed" };
}

type DeleteDependencies = { deletePublic: typeof deleteFile; deletePrivate: typeof deleteCirclePrivateFile };
const defaultDeleteDependencies: DeleteDependencies = {
    deletePublic: deleteFile,
    deletePrivate: deleteCirclePrivateFile,
};

export type DeleteCircleOwnedMediaInput = { url: string; expectedCircleId: string };

export async function deleteCircleOwnedMedia(
    { url, expectedCircleId }: DeleteCircleOwnedMediaInput,
    dependencies: DeleteDependencies = defaultDeleteDependencies,
): Promise<void> {
    if (!ObjectId.isValid(expectedCircleId)) throw new Error("Invalid Circle media owner.");
    const classified = classifyOwnedMediaUrl(url);
    if (classified.kind === "private") {
        await dependencies.deletePrivate(classified.mediaId!, new ObjectId(expectedCircleId).toHexString());
    } else if (classified.kind === "public") {
        await dependencies.deletePublic(url);
    }
}

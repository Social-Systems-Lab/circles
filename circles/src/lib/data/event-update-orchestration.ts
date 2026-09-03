import { ObjectId } from "mongodb";
import type { EventNoticeboardFeedBinding, EventNoticeboardPostBinding } from "./noticeboard-source-binding-policy";
import type { ValidatedEventNoticeboardContext, ValidatedEventNoticeboardEntry } from "./event-noticeboard-binding-orchestration";
import {
    orchestrateEventNoticeboardCleanup,
    type EventNoticeboardCleanupResult,
} from "./event-noticeboard-cleanup-orchestration";

export const deleteEventMediaWithFailurePropagation = async (
    urls: readonly string[],
    deleteMedia: (url: string) => Promise<unknown>,
): Promise<void> => {
    const results = await Promise.allSettled(urls.map((url) => deleteMedia(url)));
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) throw rejected.reason;
};

export type EventUpdateOrchestrationResult =
    | { status: "success" }
    | Extract<EventNoticeboardCleanupResult, { status: "noticeboard-unavailable" }>
    | {
          status: "event-update-failed";
          cleanupPerformed: boolean;
          sourceMutationCompleted: false;
          sourceMutationPossible: true;
      }
    | {
          status: "noticeboard-cleanup-failed";
          partial: true;
          error: unknown;
          cleanup: Extract<EventNoticeboardCleanupResult, { status: "partial-cleanup-failed" }>;
      }
    | {
          status: "post-cleanup-operation-failed";
          phase: "media" | "event" | "backlinks" | "revalidate";
          cleanupPerformed: boolean;
          sourceMutationCompleted: boolean;
          sourceMutationPossible: boolean;
          error: unknown;
      }
    | {
          status: "noticeboard-sync-failed";
          error: unknown;
          cleanupPerformed: boolean;
          sourceMutationCompleted: true;
          sourceMutationPossible: true;
      };

export const orchestrateEventUpdate = async <TMedia>({
    eventId,
    primaryCircleId,
    existingHostCircleIds,
    requestedHostCircleIds,
    noticeboardPostId,
    noticeboardPostIdsByCircleId,
    shouldSynchronizeNoticeboard,
    noticeboardPublicationRequested,
    findPostById,
    findFeedById,
    uploadMedia,
    deleteOldMedia,
    updateEvent,
    synchronizeHost,
    deleteValidatedPost,
    writeNoticeboardBacklinks,
    revalidate,
}: {
    eventId: unknown;
    primaryCircleId: unknown;
    existingHostCircleIds: unknown;
    requestedHostCircleIds: unknown;
    noticeboardPostId?: unknown;
    noticeboardPostIdsByCircleId?: unknown;
    shouldSynchronizeNoticeboard: boolean;
    noticeboardPublicationRequested: boolean;
    findPostById: (id: ObjectId) => Promise<EventNoticeboardPostBinding | null>;
    findFeedById: (id: ObjectId) => Promise<EventNoticeboardFeedBinding | null>;
    uploadMedia: () => Promise<TMedia>;
    deleteOldMedia: () => Promise<void>;
    updateEvent: (media: TMedia) => Promise<boolean>;
    synchronizeHost: (hostCircleId: string, binding?: ValidatedEventNoticeboardEntry) => Promise<string | null>;
    deleteValidatedPost: (postId: string) => Promise<void>;
    writeNoticeboardBacklinks: (map: Record<string, string>, primaryPostId: string | undefined) => Promise<void>;
    revalidate: () => void;
}): Promise<EventUpdateOrchestrationResult> => {
    let context: ValidatedEventNoticeboardContext | null = null;
    let cleanupDeletedCount = 0;
    if (shouldSynchronizeNoticeboard) {
        const cleanup = await orchestrateEventNoticeboardCleanup({
            eventId,
            primaryCircleId,
            existingHostCircleIds,
            requestedHostCircleIds,
            noticeboardPostId,
            noticeboardPostIdsByCircleId,
            findPostById,
            findFeedById,
            shouldDelete: noticeboardPublicationRequested
                ? (hostCircleId, requested) => !new Set(requested).has(hostCircleId)
                : undefined,
            deleteValidatedPost,
        });
        if (cleanup.status === "noticeboard-unavailable") return cleanup;
        if (cleanup.status === "partial-cleanup-failed") {
            return {
                status: "noticeboard-cleanup-failed",
                partial: true,
                error: cleanup.error,
                cleanup,
            };
        }
        context = cleanup.context;
        cleanupDeletedCount = cleanup.deletedCount;
        if (!noticeboardPublicationRequested) {
            let media: TMedia;
            try {
                media = await uploadMedia();
                await deleteOldMedia();
            } catch (error) {
                return {
                    status: "post-cleanup-operation-failed",
                    phase: "media",
                    cleanupPerformed: cleanup.deletedCount > 0,
                    sourceMutationCompleted: false,
                    sourceMutationPossible: false,
                    error,
                };
            }
            try {
                if (!(await updateEvent(media))) {
                    return {
                        status: "event-update-failed",
                        cleanupPerformed: cleanup.deletedCount > 0,
                        sourceMutationCompleted: false,
                        sourceMutationPossible: true,
                    };
                }
            } catch (error) {
                return {
                    status: "post-cleanup-operation-failed",
                    phase: "event",
                    cleanupPerformed: cleanup.deletedCount > 0,
                    sourceMutationCompleted: false,
                    sourceMutationPossible: true,
                    error,
                };
            }
            try {
                await writeNoticeboardBacklinks({}, undefined);
            } catch (error) {
                return {
                    status: "post-cleanup-operation-failed",
                    phase: "backlinks",
                    cleanupPerformed: cleanup.deletedCount > 0,
                    sourceMutationCompleted: true,
                    sourceMutationPossible: true,
                    error,
                };
            }
            try {
                revalidate();
            } catch (error) {
                return {
                    status: "post-cleanup-operation-failed",
                    phase: "revalidate",
                    cleanupPerformed: cleanup.deletedCount > 0,
                    sourceMutationCompleted: true,
                    sourceMutationPossible: true,
                    error,
                };
            }
            return { status: "success" };
        }
    }

    let media: TMedia;
    try {
        media = await uploadMedia();
        await deleteOldMedia();
    } catch (error) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "media",
            cleanupPerformed: cleanupDeletedCount > 0,
            sourceMutationCompleted: false,
            sourceMutationPossible: false,
            error,
        };
    }
    try {
        if (!(await updateEvent(media))) {
            return {
                status: "event-update-failed",
                cleanupPerformed: cleanupDeletedCount > 0,
                sourceMutationCompleted: false,
                sourceMutationPossible: true,
            };
        }
    } catch (error) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "event",
            cleanupPerformed: cleanupDeletedCount > 0,
            sourceMutationCompleted: false,
            sourceMutationPossible: true,
            error,
        };
    }

    if (shouldSynchronizeNoticeboard && context) {
        const requested = new Set(context.requestedHostCircleIds);
        const nextMap = Object.fromEntries(
            Object.entries(context.entriesByCircleId)
                .filter(([id]) => requested.has(id))
                .map(([id, entry]) => [id, entry.postId]),
        );
        try {
            for (const hostCircleId of context.requestedHostCircleIds || []) {
                const binding = context.entriesByCircleId[hostCircleId];
                const postId = await synchronizeHost(hostCircleId, binding);
                if (!postId) throw new Error("Event noticeboard synchronization returned no Post.");
                nextMap[hostCircleId] = postId;
            }
            await writeNoticeboardBacklinks(nextMap, nextMap[context.primaryCircleId]);
        } catch (error) {
            return {
                status: "noticeboard-sync-failed",
                error,
                cleanupPerformed: cleanupDeletedCount > 0,
                sourceMutationCompleted: true,
                sourceMutationPossible: true,
            };
        }
    }
    try {
        revalidate();
    } catch (error) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "revalidate",
            cleanupPerformed: cleanupDeletedCount > 0,
            sourceMutationCompleted: true,
            sourceMutationPossible: true,
            error,
        };
    }
    return { status: "success" };
};

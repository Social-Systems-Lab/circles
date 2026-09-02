import { ObjectId } from "mongodb";
import type { EventNoticeboardFeedBinding, EventNoticeboardPostBinding } from "./noticeboard-source-binding-policy";
import {
    resolveEventNoticeboardBindings,
    type ValidatedEventNoticeboardContext,
    type ValidatedEventNoticeboardEntry,
} from "./event-noticeboard-binding-orchestration";

export type EventUpdateOrchestrationResult =
    | { status: "success" }
    | { status: "noticeboard-unavailable" }
    | { status: "event-update-failed" }
    | { status: "noticeboard-sync-failed"; error: unknown };

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
    writeNoticeboardBacklinks: (map: Record<string, string>, primaryPostId: string | undefined) => Promise<void>;
    revalidate: () => void;
}): Promise<EventUpdateOrchestrationResult> => {
    let context: ValidatedEventNoticeboardContext | null = null;
    if (shouldSynchronizeNoticeboard) {
        context = await resolveEventNoticeboardBindings({
            eventId,
            primaryCircleId,
            existingHostCircleIds,
            requestedHostCircleIds,
            noticeboardPostId,
            noticeboardPostIdsByCircleId,
            findPostById,
            findFeedById,
        });
        if (!context) return { status: "noticeboard-unavailable" };
        if (!noticeboardPublicationRequested) return { status: "noticeboard-unavailable" };
        const requested = new Set(context.requestedHostCircleIds);
        if (context.existingHostCircleIds.some((id) => !requested.has(id)))
            return { status: "noticeboard-unavailable" };
    }

    const media = await uploadMedia();
    await deleteOldMedia();
    if (!(await updateEvent(media))) return { status: "event-update-failed" };

    if (shouldSynchronizeNoticeboard && context) {
        const nextMap = Object.fromEntries(
            Object.entries(context.entriesByCircleId).map(([id, entry]) => [id, entry.postId]),
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
            return { status: "noticeboard-sync-failed", error };
        }
    }
    revalidate();
    return { status: "success" };
};

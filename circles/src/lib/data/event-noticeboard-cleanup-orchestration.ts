import { ObjectId } from "mongodb";
import type { EventNoticeboardFeedBinding, EventNoticeboardPostBinding } from "./noticeboard-source-binding-policy";
import {
    resolveEventNoticeboardBindings,
    type ValidatedEventNoticeboardContext,
} from "./event-noticeboard-binding-orchestration";

type EventNoticeboardCleanupState = {
    attemptedTargetCount: number;
    deletedCount: number;
    deletedHostCircleIds: string[];
    deletedPostIds: string[];
    uncertainHostCircleId: string | null;
    uncertainPostId: string | null;
    remainingEntriesByCircleId: Record<string, string> | null;
    destructiveEffectsPossible: boolean;
};

export type EventNoticeboardCleanupResult =
    | (EventNoticeboardCleanupState & {
          status: "success";
          context: ValidatedEventNoticeboardContext;
          remainingEntriesByCircleId: Record<string, string>;
      })
    | (EventNoticeboardCleanupState & {
          status: "noticeboard-unavailable";
          attemptedTargetCount: 0;
          deletedCount: 0;
          deletedHostCircleIds: [];
          deletedPostIds: [];
          uncertainHostCircleId: null;
          uncertainPostId: null;
          remainingEntriesByCircleId: null;
          destructiveEffectsPossible: false;
      })
    | (EventNoticeboardCleanupState & {
          status: "partial-cleanup-failed";
          error: unknown;
          uncertainHostCircleId: string;
          uncertainPostId: string;
          remainingEntriesByCircleId: Record<string, string>;
          destructiveEffectsPossible: true;
      });

const noticeboardUnavailable = (): Extract<EventNoticeboardCleanupResult, { status: "noticeboard-unavailable" }> => ({
    status: "noticeboard-unavailable",
    attemptedTargetCount: 0,
    deletedCount: 0,
    deletedHostCircleIds: [],
    deletedPostIds: [],
    uncertainHostCircleId: null,
    uncertainPostId: null,
    remainingEntriesByCircleId: null,
    destructiveEffectsPossible: false,
});

export const orchestrateEventNoticeboardCleanup = async ({
    eventId,
    primaryCircleId,
    existingHostCircleIds,
    requestedHostCircleIds,
    noticeboardPostId,
    noticeboardPostIdsByCircleId,
    findPostById,
    findFeedById,
    shouldDelete,
    deleteValidatedPost,
}: {
    eventId: unknown;
    primaryCircleId: unknown;
    existingHostCircleIds: unknown;
    requestedHostCircleIds?: unknown;
    noticeboardPostId?: unknown;
    noticeboardPostIdsByCircleId?: unknown;
    findPostById: (id: ObjectId) => Promise<EventNoticeboardPostBinding | null>;
    findFeedById: (id: ObjectId) => Promise<EventNoticeboardFeedBinding | null>;
    shouldDelete?: (hostCircleId: string, requestedHostCircleIds?: readonly string[]) => boolean;
    deleteValidatedPost: (postId: string) => Promise<void>;
}): Promise<EventNoticeboardCleanupResult> => {
    let context: ValidatedEventNoticeboardContext;
    let targets: ValidatedEventNoticeboardContext["entriesByCircleId"][string][];
    let remainingEntriesByCircleId: Record<string, string>;
    try {
        const resolved = await resolveEventNoticeboardBindings({
            eventId,
            primaryCircleId,
            existingHostCircleIds,
            requestedHostCircleIds,
            noticeboardPostId,
            noticeboardPostIdsByCircleId,
            findPostById,
            findFeedById,
        });
        if (!resolved) return noticeboardUnavailable();
        context = resolved;

        // Complete validated target/remaining-state setup also precedes the first destructive effect.
        const requested = context.requestedHostCircleIds;
        targets = Object.values(context.entriesByCircleId).filter((entry) =>
            shouldDelete ? shouldDelete(entry.hostCircleId, requested) : true,
        );
        remainingEntriesByCircleId = Object.fromEntries(
            Object.values(context.entriesByCircleId).map((entry) => [entry.hostCircleId, entry.postId]),
        );
    } catch {
        return noticeboardUnavailable();
    }
    let deletedCount = 0;
    const deletedHostCircleIds: string[] = [];
    const deletedPostIds: string[] = [];
    let attemptedTargetCount = 0;
    for (const target of targets) {
        attemptedTargetCount++;
        try {
            // This ID is available only from the validated resolver output.
            await deleteValidatedPost(target.postId);
            delete remainingEntriesByCircleId[target.hostCircleId];
            deletedCount++;
            deletedHostCircleIds.push(target.hostCircleId);
            deletedPostIds.push(target.postId);
        } catch (error) {
            // deletePost can remove the Post and then fail while cleaning derived data.
            // Preserve the uncertain target's backlink as evidence and report possible destruction.
            return {
                status: "partial-cleanup-failed",
                error,
                attemptedTargetCount,
                deletedCount,
                deletedHostCircleIds,
                deletedPostIds,
                uncertainHostCircleId: target.hostCircleId,
                uncertainPostId: target.postId,
                remainingEntriesByCircleId,
                destructiveEffectsPossible: true,
            };
        }
    }
    return {
        status: "success",
        context,
        attemptedTargetCount,
        deletedCount,
        deletedHostCircleIds,
        deletedPostIds,
        uncertainHostCircleId: null,
        uncertainPostId: null,
        remainingEntriesByCircleId,
        destructiveEffectsPossible: deletedCount > 0,
    };
};

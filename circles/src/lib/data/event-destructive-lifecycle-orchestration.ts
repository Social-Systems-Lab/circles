import type { EventNoticeboardCleanupResult } from "./event-noticeboard-cleanup-orchestration";

export type EventDestructiveLifecycleFailurePhase = "prepare" | "source" | "backlinks" | "revalidate";

export type EventDestructiveLifecycleResult =
    | { status: "success"; cleanupDeletedCount: number }
    | Extract<EventNoticeboardCleanupResult, { status: "noticeboard-unavailable" }>
    | {
          status: "noticeboard-cleanup-failed";
          cleanup: Extract<EventNoticeboardCleanupResult, { status: "partial-cleanup-failed" }>;
          destructiveEffectsPossible: boolean;
      }
    | {
          status: "post-cleanup-operation-failed";
          phase: EventDestructiveLifecycleFailurePhase;
          error?: unknown;
          cleanupDeletedCount: number;
          sourceMutationCompleted: boolean;
          sourceMutationPossible: boolean;
          destructiveEffectsPossible: boolean;
      };

export const orchestrateEventDestructiveLifecycle = async <TPrepared = undefined>({
    cleanupNoticeboards,
    prepare,
    mutateSource,
    clearBacklinks,
    revalidate,
}: {
    cleanupNoticeboards: () => Promise<EventNoticeboardCleanupResult>;
    prepare?: () => Promise<TPrepared>;
    mutateSource: (prepared: TPrepared | undefined) => Promise<boolean>;
    clearBacklinks?: () => Promise<void>;
    revalidate: () => void | Promise<void>;
}): Promise<EventDestructiveLifecycleResult> => {
    const cleanup = await cleanupNoticeboards();
    if (cleanup.status === "noticeboard-unavailable") return cleanup;
    if (cleanup.status === "partial-cleanup-failed") {
        return {
            status: "noticeboard-cleanup-failed",
            cleanup,
            destructiveEffectsPossible: cleanup.destructiveEffectsPossible,
        };
    }

    const cleanupDeletedCount = cleanup.deletedCount;
    const destructiveEffectsPossible = cleanupDeletedCount > 0;
    let prepared: TPrepared | undefined;
    try {
        prepared = prepare ? await prepare() : undefined;
    } catch (error) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "prepare",
            error,
            cleanupDeletedCount,
            sourceMutationCompleted: false,
            sourceMutationPossible: false,
            destructiveEffectsPossible,
        };
    }

    let sourceMutationCompleted = false;
    try {
        sourceMutationCompleted = await mutateSource(prepared);
    } catch (error) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "source",
            error,
            cleanupDeletedCount,
            sourceMutationCompleted: false,
            sourceMutationPossible: true,
            destructiveEffectsPossible,
        };
    }
    if (!sourceMutationCompleted) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "source",
            cleanupDeletedCount,
            sourceMutationCompleted: false,
            sourceMutationPossible: true,
            destructiveEffectsPossible,
        };
    }

    if (clearBacklinks) {
        try {
            await clearBacklinks();
        } catch (error) {
            return {
                status: "post-cleanup-operation-failed",
                phase: "backlinks",
                error,
                cleanupDeletedCount,
                sourceMutationCompleted: true,
                sourceMutationPossible: true,
                destructiveEffectsPossible,
            };
        }
    }

    try {
        await revalidate();
    } catch (error) {
        return {
            status: "post-cleanup-operation-failed",
            phase: "revalidate",
            error,
            cleanupDeletedCount,
            sourceMutationCompleted: true,
            sourceMutationPossible: true,
            destructiveEffectsPossible,
        };
    }
    return { status: "success", cleanupDeletedCount };
};

import { ObjectId } from "mongodb";
import type { ShiftNoticeboardFeedBinding, ShiftNoticeboardPostBinding } from "./noticeboard-source-binding-policy";
import {
    resolveShiftNoticeboardBinding,
    type ValidatedShiftNoticeboardBinding,
} from "./shift-noticeboard-binding-orchestration";

export type ShiftUpdateOrchestrationResult =
    | { status: "success" }
    | { status: "noticeboard-unavailable" }
    | { status: "task-update-failed" }
    | { status: "noticeboard-sync-failed"; error: unknown };

export const orchestrateShiftUpdate = async <TMedia>({
    storedNoticeboardPostId,
    expectedTaskId,
    expectedCircleId,
    shouldSynchronizeNoticeboard,
    findPostById,
    findFeedById,
    uploadMedia,
    deleteOldMedia,
    updateTask,
    synchronizeNoticeboard,
    writeNoticeboardBacklink,
    revalidate,
}: {
    storedNoticeboardPostId: unknown;
    expectedTaskId: unknown;
    expectedCircleId: unknown;
    shouldSynchronizeNoticeboard: boolean;
    findPostById: (id: ObjectId) => Promise<ShiftNoticeboardPostBinding | null>;
    findFeedById: (id: ObjectId) => Promise<ShiftNoticeboardFeedBinding | null>;
    uploadMedia: () => Promise<TMedia>;
    deleteOldMedia: () => Promise<void>;
    updateTask: (uploadedMedia: TMedia) => Promise<boolean>;
    synchronizeNoticeboard: (binding?: ValidatedShiftNoticeboardBinding) => Promise<string | null>;
    writeNoticeboardBacklink: (postId: string) => Promise<void>;
    revalidate: (noticeboardSynchronized: boolean) => void;
}): Promise<ShiftUpdateOrchestrationResult> => {
    let validatedBinding: ValidatedShiftNoticeboardBinding | undefined;
    if (storedNoticeboardPostId !== null && storedNoticeboardPostId !== undefined) {
        const binding = await resolveShiftNoticeboardBinding({
            storedNoticeboardPostId,
            expectedTaskId,
            expectedCircleId,
            findPostById,
            findFeedById,
        });
        if (!binding) return { status: "noticeboard-unavailable" };
        validatedBinding = binding;
    }

    const uploadedMedia = await uploadMedia();
    await deleteOldMedia();

    if (!(await updateTask(uploadedMedia))) {
        return { status: "task-update-failed" };
    }

    if (shouldSynchronizeNoticeboard) {
        try {
            const noticeboardPostId = await synchronizeNoticeboard(validatedBinding);
            if (!validatedBinding && noticeboardPostId) {
                await writeNoticeboardBacklink(noticeboardPostId);
            }
        } catch (error) {
            return { status: "noticeboard-sync-failed", error };
        }
    }

    revalidate(shouldSynchronizeNoticeboard);
    return { status: "success" };
};

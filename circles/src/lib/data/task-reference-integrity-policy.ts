import { ObjectId } from "mongodb";

export const TASK_UPDATE_UNAVAILABLE_MESSAGE = "Content unavailable";

type CanonicalTaskOwnership = {
    _id?: unknown;
    circleId?: unknown;
};

export type TaskUpdateOwnership = {
    taskId: string;
    circleId: string;
};

const normalizeObjectId = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!ObjectId.isValid(trimmed)) return null;
    return new ObjectId(trimmed).toHexString();
};

/**
 * Loads ownership from the canonical Task. The caller's Circle is only an
 * equality assertion; Task/Shift ownership migration is intentionally unsupported.
 */
export const resolveTaskUpdateOwnership = async <T extends CanonicalTaskOwnership>(
    taskIdInput: unknown,
    requestedCircleId: unknown,
    loadTask: (taskId: string) => Promise<T | null>,
): Promise<{ task: T; ownership: TaskUpdateOwnership } | null> => {
    const taskId = normalizeObjectId(taskIdInput);
    if (!taskId) return null;

    const task = await loadTask(taskId);
    if (!task) return null;

    const loadedTaskId = normalizeObjectId(typeof task._id === "string" ? task._id : task._id?.toString());
    const circleId = normalizeObjectId(task.circleId);
    if (loadedTaskId !== taskId || !circleId) return null;

    if (requestedCircleId !== undefined && requestedCircleId !== null) {
        const requested = normalizeObjectId(requestedCircleId);
        if (!requested || requested !== circleId) return null;
    }

    return { task, ownership: { taskId, circleId } };
};

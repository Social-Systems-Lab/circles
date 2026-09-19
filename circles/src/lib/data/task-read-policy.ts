import { AsyncLocalStorage } from "node:async_hooks";
import { ObjectId } from "mongodb";
import type { Circle, Member, TaskDisplay } from "@/models/models";

export type TaskReadBoundaryOverrides = {
    aggregateContributionTasks: (pipeline: object[]) => Promise<TaskDisplay[]>;
    findSourceCircles: (circleIds: string[]) => Promise<Circle[]>;
    findViewerMemberships: (viewerDid: string) => Promise<Member[]>;
    authorizeTaskModule: (viewerDid: string | undefined, circleId: string, feature: unknown) => Promise<boolean>;
    getAuthenticatedUserDid: () => Promise<string | undefined>;
    getCircleByHandle: (handle: string) => Promise<Circle | null>;
    getTaskById: (taskId: string, viewerDid?: string) => Promise<TaskDisplay | null>;
    filterTasksForViewer: (tasks: TaskDisplay[], viewerDid?: string) => Promise<TaskDisplay[]>;
};

const taskReadBoundaryOverrides = new AsyncLocalStorage<Partial<TaskReadBoundaryOverrides>>();

export const runWithTaskReadBoundaryOverrides = async <T>(
    overrides: Partial<TaskReadBoundaryOverrides>,
    callback: () => Promise<T>,
): Promise<T> => taskReadBoundaryOverrides.run(overrides, callback);

export const getTaskReadBoundaryOverrides = (): Partial<TaskReadBoundaryOverrides> =>
    taskReadBoundaryOverrides.getStore() ?? {};

export const isTaskBoundToRouteCircle = (
    task: { circleId?: unknown } | null | undefined,
    routeCircle: Partial<Circle> | null | undefined,
): boolean => {
    const taskCircleId = task?.circleId;
    const routeCircleId = routeCircle?._id?.toString();
    if (typeof taskCircleId !== "string" || !routeCircleId) return false;
    if (!ObjectId.isValid(taskCircleId) || !ObjectId.isValid(routeCircleId)) return false;
    return new ObjectId(taskCircleId).toHexString() === new ObjectId(routeCircleId).toHexString();
};

import type { Circle, CirclePublishStatus } from "@/models/models";

export const getCirclePublishStatus = (circle?: Partial<Circle> | null): CirclePublishStatus =>
    circle?.publishStatus ?? "published";

export const isCirclePublished = (circle?: Partial<Circle> | null): boolean =>
    getCirclePublishStatus(circle) === "published";

export const getPublishedCircleQuery = (): any => ({
    $or: [{ publishStatus: "published" as const }, { publishStatus: { $exists: false } }],
});

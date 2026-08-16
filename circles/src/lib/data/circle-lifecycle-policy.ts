import type { Circle, CircleModerationStatus } from "@/models/models";
import { ObjectId, type Filter } from "mongodb";

export const getDiscoverableLifecycleQuery = (): Filter<Circle> => ({
    $or: [
        { circleType: "user" },
        { moderationStatus: { $in: ["active", "paused"] } },
        { moderationStatus: { $exists: false } },
    ],
});

export const getCircleModerationStatus = (circle?: Partial<Circle> | null): CircleModerationStatus =>
    circle?.moderationStatus ?? "active";

export const canReadCircleByLifecycle = (circle?: Partial<Circle> | null) =>
    circle?.circleType === "user" || ["active", "paused"].includes(getCircleModerationStatus(circle));

export const canWriteCircleByLifecycle = (circle?: Partial<Circle> | null) =>
    circle?.circleType === "user" || getCircleModerationStatus(circle) === "active";

export const canDiscoverCircleByLifecycle = canReadCircleByLifecycle;

export async function assertCircleWritesAllowed(circleOrId: Partial<Circle> | string): Promise<void> {
    const circle =
        typeof circleOrId === "string"
            ? await (async () => {
                  const { Circles } = await import("@/lib/data/db");
                  return Circles.findOne(
                      { _id: new ObjectId(circleOrId) },
                      { projection: { circleType: 1, moderationStatus: 1 } },
                  );
              })()
            : circleOrId;
    if (!circle) throw new Error("Circle not found");
    if (circle.circleType === "user") return;
    if (!canWriteCircleByLifecycle(circle)) {
        throw new Error("Circle changes are unavailable while the circle is paused or unavailable.");
    }
}

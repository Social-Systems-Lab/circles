import { Circles } from "@/lib/data/db";
import { canReadCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { ObjectId } from "mongodb";

export type StoredObjectAccess = "public" | "authenticated" | "denied";

// Storage keys currently begin with their owner id. This policy seam is intentionally
// separate from the proxy so future secret visibility can require membership here.
export async function getStoredObjectAccess(objectName: string): Promise<StoredObjectAccess> {
    const ownerId = objectName.split("/", 1)[0];
    if (!ObjectId.isValid(ownerId)) return "public";

    const owner = await Circles.findOne(
        { _id: new ObjectId(ownerId) },
        { projection: { circleType: 1, moderationStatus: 1 } },
    );
    if (!owner || owner.circleType === "user") return "public";
    return canReadCircleByLifecycle(owner) ? "public" : "denied";
}

import { Circles } from "@/lib/data/db";
import { appendPlatformAuditEvent } from "@/lib/data/platform-audit";
import { isSuperAdminDid } from "@/lib/auth/superadmin";
import type { CircleModerationStatus } from "@/models/models";
import { ObjectId } from "mongodb";
import { getCircleModerationStatus } from "@/lib/data/circle-lifecycle-policy";

const allowedTransitions: Record<CircleModerationStatus, CircleModerationStatus[]> = {
    active: ["paused", "suspended", "removed"],
    paused: ["active", "suspended", "removed"],
    suspended: ["active", "removed"],
    removed: [],
};

export async function changeCircleModerationStatus(input: {
    circleId: string;
    actorDid: string;
    status: CircleModerationStatus;
    reason: string;
}) {
    if (!(await isSuperAdminDid(input.actorDid))) throw new Error("Unauthorized: superadmin access required.");
    const reason = input.reason.trim();
    if (!reason) throw new Error("A moderation reason is required.");

    const circle = await Circles.findOne({ _id: new ObjectId(input.circleId), circleType: "circle" });
    if (!circle) throw new Error("Circle not found.");
    const previousStatus = getCircleModerationStatus(circle);
    if (!allowedTransitions[previousStatus].includes(input.status)) {
        throw new Error(`Invalid moderation transition: ${previousStatus} to ${input.status}.`);
    }

    const details = { previousStatus, status: input.status, reason };
    await appendPlatformAuditEvent({
        eventType: "circle.moderation_status_change_requested",
        actorDid: input.actorDid,
        targetType: "circle",
        targetId: input.circleId,
        details,
    });

    const changedAt = new Date();
    const result = await Circles.updateOne(
        {
            _id: new ObjectId(input.circleId),
            $or: [
                { moderationStatus: previousStatus },
                ...(previousStatus === "active" ? [{ moderationStatus: { $exists: false } }] : []),
            ],
        },
        {
            $set: {
                moderationStatus: input.status,
                moderationStatusChangedAt: changedAt,
                moderationStatusChangedBy: input.actorDid,
            },
        },
    );
    if (result.modifiedCount !== 1) throw new Error("Circle moderation status changed concurrently; retry the action.");

    await appendPlatformAuditEvent({
        eventType: "circle.moderation_status_changed",
        actorDid: input.actorDid,
        targetType: "circle",
        targetId: input.circleId,
        details,
    });
    return { previousStatus, status: input.status, changedAt };
}

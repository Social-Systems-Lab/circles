import { Circles, PlatformAuditEvents } from "@/lib/data/db";
import { appendPlatformAuditEvent } from "@/lib/data/platform-audit";
import { isSuperAdminDid } from "@/lib/auth/superadmin";
import { circleModerationStatusSchema, type CircleModerationStatus } from "@/models/models";
import { ObjectId } from "mongodb";
import { circleModerationTransitions, getCircleModerationStatus } from "@/lib/data/circle-lifecycle-rules";
import { sendCircleModerationMessage } from "@/lib/data/circle-moderation-messaging";

export async function sendCircleModerationMessageBestEffort(
    input: Parameters<typeof sendCircleModerationMessage>[0],
    sendMessage: typeof sendCircleModerationMessage = sendCircleModerationMessage,
): Promise<void> {
    try {
        await sendMessage(input);
    } catch (error) {
        console.error("Circle moderation messaging failed after successful lifecycle transition:", error);
    }
}

type RetryCircleModerationDeliveryDependencies = {
    findAuditEvent: (eventId: ObjectId) => Promise<any>;
    findCircle: (circleId: ObjectId) => Promise<any>;
    sendMessage: typeof sendCircleModerationMessage;
};

const retryDependencies: RetryCircleModerationDeliveryDependencies = {
    findAuditEvent: (eventId) => PlatformAuditEvents.findOne({ _id: eventId } as any),
    findCircle: (circleId) => Circles.findOne({ _id: circleId, circleType: "circle" }),
    sendMessage: sendCircleModerationMessage,
};

const isCanonicalObjectId = (value: unknown): value is string =>
    typeof value === "string" && ObjectId.isValid(value) && new ObjectId(value).toString() === value.toLowerCase();

export async function retryCircleModerationDelivery(
    lifecycleEventId: string,
    dependencies: RetryCircleModerationDeliveryDependencies = retryDependencies,
): Promise<void> {
    if (!isCanonicalObjectId(lifecycleEventId)) throw new Error("Invalid Circle lifecycle event ID.");
    const event = await dependencies.findAuditEvent(new ObjectId(lifecycleEventId));
    if (!event) throw new Error("Circle lifecycle event not found.");
    if (event.eventType !== "circle.moderation_status_changed") throw new Error("Invalid Circle lifecycle event type.");
    if (event.targetType !== "circle") throw new Error("Invalid Circle lifecycle target type.");
    if (!isCanonicalObjectId(event.targetId)) throw new Error("Invalid Circle lifecycle target ID.");
    if (typeof event.actorDid !== "string" || !event.actorDid.trim()) throw new Error("Invalid Circle lifecycle actor DID.");
    const details = event.details || {};
    const previousStatusResult = circleModerationStatusSchema.safeParse(details.previousStatus);
    const statusResult = circleModerationStatusSchema.safeParse(details.status);
    if (!previousStatusResult.success || !statusResult.success) throw new Error("Invalid Circle lifecycle status.");
    const previousStatus = previousStatusResult.data;
    const status = statusResult.data;
    if (!circleModerationTransitions[previousStatus].includes(status)) {
        throw new Error(`Invalid moderation transition: ${previousStatus} to ${status}.`);
    }
    if (!(details.changedAt instanceof Date) || Number.isNaN(details.changedAt.getTime())) {
        throw new Error("Invalid Circle lifecycle changedAt timestamp.");
    }
    if (typeof details.reason !== "string" || !details.reason.trim()) {
        throw new Error("A moderation reason is required.");
    }
    const circle = await dependencies.findCircle(new ObjectId(event.targetId));
    if (!circle) throw new Error("Circle not found.");
    await dependencies.sendMessage({
        lifecycleEventId,
        circleId: event.targetId,
        circleName: circle.name?.trim() || "Unnamed Circle",
        actorDid: event.actorDid,
        previousStatus,
        status,
        reason: details.reason.trim(),
        changedAt: details.changedAt,
    });
}

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
    if (!circleModerationTransitions[previousStatus].includes(input.status)) {
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

    const successfulAuditEvent = await appendPlatformAuditEvent({
        eventType: "circle.moderation_status_changed",
        actorDid: input.actorDid,
        targetType: "circle",
        targetId: input.circleId,
        details: { ...details, changedAt },
    });
    await sendCircleModerationMessageBestEffort({
        lifecycleEventId: String(successfulAuditEvent._id),
        circleId: input.circleId,
        circleName: circle.name?.trim() || "Unnamed Circle",
        actorDid: input.actorDid,
        previousStatus,
        status: input.status,
        reason,
        changedAt,
    });
    return { previousStatus, status: input.status, changedAt, lifecycleEventId: String(successfulAuditEvent._id) };
}

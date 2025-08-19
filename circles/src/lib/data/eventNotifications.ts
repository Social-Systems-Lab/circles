import { Circle, Event as EventModel, EventDisplay, EventStage, UserPrivate } from "@/models/models";
import { sendNotifications } from "./matrix";
import { getUserPrivate } from "./user";
import { getCircleById } from "./circle";
import { features } from "./constants";
import { getAuthorizedMembers } from "../auth/auth";
import { sanitizeObjectForJSON } from "../utils/sanitize";

/**
 * Resolve the Circle for an event
 */
async function getEventCircle(event: Pick<EventModel, "circleId">): Promise<Circle | null> {
    if (!event?.circleId) return null;
    const circle = await getCircleById(event.circleId);
    return circle;
}

/**
 * Notify reviewers when an event is submitted for review (draft -> review)
 */
export async function notifyEventSubmittedForReview(
    event: Pick<EventModel, "_id" | "title" | "circleId">,
    submitter: Circle,
) {
    try {
        const circle = await getEventCircle(event);
        if (!circle) return;

        // Find DIDs of users with review permission (excluding the submitter)
        const reviewerDids = (await getAuthorizedMembers(circle, features.events?.review))
            .map((u) => u.did)
            .filter((did): did is string => !!did && did !== submitter.did);

        if (reviewerDids.length === 0) return;

        const reviewerPrivates: UserPrivate[] = (
            await Promise.all(reviewerDids.map((did) => getUserPrivate(did)))
        ).filter((up): up is UserPrivate => up !== null);

        if (reviewerPrivates.length === 0) return;

        await sendNotifications(
            "event_submitted_for_review",
            reviewerPrivates,
            sanitizeObjectForJSON({
                circle,
                user: submitter,
                eventId: (event as any)._id?.toString?.() || String((event as any)._id),
                eventTitle: event.title,
            }),
        );
    } catch (err) {
        console.error("Error in notifyEventSubmittedForReview:", err);
    }
}

/**
 * Notify the event author when the event is approved/opened (review -> open, or draft -> open)
 */
export async function notifyEventApproved(
    event: Pick<EventModel, "_id" | "title" | "circleId" | "createdBy">,
    approver: Circle,
) {
    try {
        const circle = await getEventCircle(event);
        if (!circle) return;

        // Don't notify if approver is the author
        if (event.createdBy === approver.did) return;

        const author = await getUserPrivate(event.createdBy);
        if (!author) return;

        await sendNotifications(
            "event_approved",
            [author],
            sanitizeObjectForJSON({
                circle,
                user: approver,
                eventId: (event as any)._id?.toString?.() || String((event as any)._id),
                eventTitle: event.title,
            }),
        );
    } catch (err) {
        console.error("Error in notifyEventApproved:", err);
    }
}

/**
 * Notify the event author when the event's status changes (generic)
 */
export async function notifyEventStatusChanged(
    event: Pick<EventModel, "_id" | "title" | "circleId" | "createdBy" | "stage">,
    changer: Circle,
    oldStage: EventStage,
) {
    try {
        const circle = await getEventCircle(event);
        if (!circle) return;

        const author = await getUserPrivate(event.createdBy);
        if (!author) return;

        // Skip notifying the changer if they are the author (optional, mirrors other modules)
        if (author.did === changer.did) return;

        await sendNotifications(
            "event_status_changed",
            [author],
            sanitizeObjectForJSON({
                circle,
                user: changer,
                eventId: (event as any)._id?.toString?.() || String((event as any)._id),
                eventTitle: event.title,
                eventOldStage: oldStage,
                eventNewStage: event.stage,
            }),
        );
    } catch (err) {
        console.error("Error in notifyEventStatusChanged:", err);
    }
}

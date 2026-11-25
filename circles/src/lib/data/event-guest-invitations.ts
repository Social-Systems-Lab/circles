import { ObjectId, type Collection } from "mongodb";
import { z } from "zod";
import type { Event, EventGuestInvitation, EventOccurrence } from "@/models/models";
import { resolveGeneratedEventOccurrence } from "@/lib/event-occurrence";
import {
    formatGuestInvitationWhen,
    GUEST_INVITATION_PATH,
    GUEST_INVITATION_TOKEN,
    guestInvitationDetails,
    guestInvitationPreviewKey,
    MAX_GUEST_INVITE_RECIPIENTS,
    type EventGuestInviteeRow,
} from "@/lib/event-guest-invitation";
import { canReadCircleByLifecycle } from "./circle-lifecycle-policy";
import * as db from "./db";
import { generateSecureToken, hashToken, sendEmail } from "./email";
import { normalizeEventHostsForRead } from "./event-host-read-policy";

type GuestTarget = Pick<EventGuestInvitation, "eventId" | "occurrenceKey" | "circleId">;
type GuestResponse = Exclude<EventGuestInvitation["status"], "pending">;

let indexesReady: Promise<unknown> | undefined;

async function guestInvitations(): Promise<Collection<EventGuestInvitation>> {
    const collection = (await db.getDb()).collection<EventGuestInvitation>("eventGuestInvitations");
    indexesReady ??= collection
        .createIndexes([
            { key: { eventId: 1, occurrenceKey: 1, email: 1 }, unique: true },
            { key: { tokenHash: 1 }, unique: true },
        ])
        .catch((error) => {
            indexesReady = undefined;
            throw error;
        });
    await indexesReady;
    return collection;
}

const HOUR_MS = 60 * 60 * 1000;
const HOURLY_GUEST_INVITE_LIMIT = 30;

type GuestInviteQuota = { _id: string; count: number; expiresAt: Date };

async function reserveGuestEmailQuota(organiser: string, count: number, now: Date): Promise<boolean> {
    // Share the existing TTL-backed counter collection. Login operations only touch their pair:/ip: keys.
    const collection = (await db.getDb()).collection<GuestInviteQuota>("loginRateLimits");
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return consumeGuestEmailQuota(collection, organiser, count, now);
}

export async function consumeGuestEmailQuota(
    collection: Pick<Collection<GuestInviteQuota>, "updateOne">,
    organiser: string,
    count: number,
    now: Date,
): Promise<boolean> {
    const window = Math.floor(now.getTime() / HOUR_MS);
    const _id = `event-guest:${hashToken(organiser)}:${window}`;
    try {
        const result = await collection.updateOne(
            { _id, count: { $lte: HOURLY_GUEST_INVITE_LIMIT - count } },
            { $inc: { count }, $setOnInsert: { expiresAt: new Date((window + 1) * HOUR_MS) } },
            { upsert: true },
        );
        return result.acknowledged;
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return false;
        throw error;
    }
}

const targetDependencies = {
    findEvent: (id: ObjectId) => db.Events.findOne({ _id: id }),
    findOccurrence: (seriesId: string, occurrenceKey: number): Promise<EventOccurrence | null> =>
        db.EventOccurrences.findOne({ seriesId, occurrenceKey }),
    hostsAvailable: async (hostIds: string[]) => {
        const circles = await db.Circles.find(
            { _id: { $in: hostIds.map((id) => new ObjectId(id)) } },
            { projection: { _id: 1, circleType: 1, moderationStatus: 1, publishStatus: 1 } },
        ).toArray();
        return (
            circles.length === hostIds.length &&
            circles.every(
                (circle) => canReadCircleByLifecycle(circle) && (circle.publishStatus ?? "published") === "published",
            )
        );
    },
    now: () => new Date(),
};

export async function resolveGuestInvitationTarget(target: GuestTarget, deps = targetDependencies) {
    if (!ObjectId.isValid(target.eventId)) return null;
    const event = await deps.findEvent(new ObjectId(target.eventId));
    if (!event || event.stage !== "open") return null;
    const hostIds = normalizeEventHostsForRead(event);
    if (!hostIds?.includes(target.circleId) || !(await deps.hostsAvailable(hostIds))) return null;

    let { startAt, endAt } = event;
    if (target.occurrenceKey !== null) {
        if (!event.recurrence) return null;
        const occurrence = resolveGeneratedEventOccurrence(
            target.eventId,
            { startAt, endAt, recurrence: event.recurrence },
            new Date(target.occurrenceKey),
            await deps.findOccurrence(target.eventId, target.occurrenceKey),
        );
        if (!occurrence || occurrence.isOccurrenceCancelled) return null;
        ({ startAt, endAt } = occurrence);
    } else if (event.recurrence) {
        return null;
    }
    startAt = new Date(startAt);
    endAt = new Date(endAt);
    const lastDay = endAt.getTime() + (event.allDay ? 86_400_000 : 0);
    if (!Number.isFinite(startAt.getTime()) || endAt < startAt || !(lastDay > deps.now().getTime())) return null;
    return { event, schedule: { startAt, endAt, allDay: !!event.allDay } };
}

const deliveryDependencies = {
    collection: guestInvitations,
    resolveTarget: resolveGuestInvitationTarget,
    reserveQuota: reserveGuestEmailQuota,
    send: sendEmail,
    now: () => new Date(),
    origin: () => process.env.CIRCLES_URL,
};

const emailSchema = z.string().max(254).email();

export async function sendGuestInvitations(
    target: GuestTarget,
    invitedBy: string,
    recipients: unknown,
    previewKey: string,
    deps = deliveryDependencies,
) {
    if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > MAX_GUEST_INVITE_RECIPIENTS) {
        return { success: false as const, message: "Enter between 1 and 10 guest email addresses." };
    }
    const normalized = recipients.map((value: unknown) =>
        typeof value === "string" ? value.trim().toLowerCase() : "",
    );
    if (normalized.some((email) => !emailSchema.safeParse(email).success)) {
        return { success: false as const, message: "Check the guest email addresses and try again." };
    }
    const resolved = await deps.resolveTarget(target);
    if (!resolved) return { success: false as const, message: "This event is unavailable for guest invitations." };
    if (previewKey !== guestInvitationPreviewKey({ ...resolved.event, ...resolved.schedule })) {
        return {
            success: false as const,
            message: "The event details changed. Refresh the event and review them before sending.",
        };
    }
    const origin = deps.origin();
    if (!origin) return { success: false as const, message: "Guest email delivery is unavailable." };
    const invitationUrl = new URL(GUEST_INVITATION_PATH, origin);
    const details = guestInvitationDetails(resolved.event);
    const { startAt, endAt, allDay } = resolved.schedule;
    const when = formatGuestInvitationWhen(startAt, endAt, allDay);
    const collection = await deps.collection();
    const scope = { eventId: target.eventId, occurrenceKey: target.occurrenceKey };
    const emails = [...new Set(normalized)];
    const existing = await collection
        .find({ ...scope, email: { $in: emails } }, { projection: { email: 1 } })
        .toArray();
    const existingEmails = new Set(existing.map(({ email }) => email));
    const freshEmails = emails.filter((email) => !existingEmails.has(email));
    const result = { success: true as const, sent: 0, unconfirmed: 0, alreadyInvited: existing.length };
    if (freshEmails.length === 0) return result;
    const now = deps.now();
    if (!(await deps.reserveQuota(invitedBy, freshEmails.length, now))) {
        return { success: false as const, message: "Guest email limit reached. Try again in the next hour." };
    }

    await Promise.all(
        freshEmails.map(async (email) => {
            const token = generateSecureToken();
            const tokenHash = hashToken(token);
            try {
                const inserted = await collection.updateOne(
                    { ...scope, email },
                    {
                        $setOnInsert: {
                            ...target,
                            email,
                            invitedBy,
                            tokenHash,
                            details,
                            status: "pending",
                            createdAt: now,
                            updatedAt: now,
                        },
                    },
                    { upsert: true },
                );
                if (!inserted.upsertedCount) {
                    result.alreadyInvited++;
                    return;
                }
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) throw error;
                result.alreadyInvited++;
                return;
            }

            const actionUrl = new URL(invitationUrl);
            actionUrl.hash = token;
            const calendarUrl = new URL(actionUrl);
            calendarUrl.searchParams.set("download", "ics");
            try {
                await deps.send({
                    to: email,
                    templateAlias: "event-guest-invitation",
                    templateModel: { ...details, when, actionUrl: actionUrl.href, calendarUrl: calendarUrl.href },
                });
                await collection.updateOne({ tokenHash }, { $set: { sentAt: deps.now() } });
                result.sent++;
            } catch {
                // A provider timeout can occur after delivery. Keep the invitation valid and avoid sending twice.
                result.unconfirmed++;
            }
        }),
    );
    return result;
}

export async function listGuestInvitees(
    eventId: string,
    occurrenceKey: number | null,
): Promise<EventGuestInviteeRow[]> {
    const collection = await guestInvitations();
    const rows = await collection
        .find({ eventId, occurrenceKey }, { projection: { _id: 0, email: 1, status: 1, sentAt: 1 } })
        .sort({ createdAt: 1 })
        .toArray();
    return rows.map(({ email, status, sentAt }) => ({ email, status, deliveryConfirmed: !!sentAt }));
}

export async function hasGuestInvitations(eventId: string): Promise<boolean> {
    return !!(await (await guestInvitations()).findOne({ eventId }, { projection: { _id: 1 } }));
}

const guestDependencies = {
    collection: guestInvitations,
    resolveTarget: resolveGuestInvitationTarget,
    now: () => new Date(),
};

export async function accessGuestInvitation(token: string, response?: GuestResponse, deps = guestDependencies) {
    if (!GUEST_INVITATION_TOKEN.test(token)) return null;
    const collection = await deps.collection();
    const tokenHash = hashToken(token);
    const invitation = await collection.findOne({ tokenHash });
    if (!invitation) return null;
    const target = await deps.resolveTarget({
        eventId: invitation.eventId,
        occurrenceKey: invitation.occurrenceKey,
        circleId: invitation.circleId,
    });
    if (!target) return null;
    if (response) {
        const result = await collection.updateOne({ tokenHash }, { $set: { status: response, updatedAt: deps.now() } });
        if (!result.matchedCount) return null;
    }
    return {
        details: invitation.details,
        schedule: target.schedule,
        status: response ?? invitation.status,
        calendarId: hashToken(JSON.stringify([invitation.eventId, invitation.occurrenceKey])),
    };
}

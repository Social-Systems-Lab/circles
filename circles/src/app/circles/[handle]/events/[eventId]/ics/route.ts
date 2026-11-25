import { ObjectId } from "mongodb";
import { EventOccurrenceInvitations, EventOccurrences, Events } from "@/lib/data/db";
import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import type { Event as EventModel, EventOccurrence } from "@/models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { canReadEventContent } from "@/lib/data/event-host-read-policy";
import { getEventIcsRouteOverrides } from "@/lib/data/ics-route-test-dependencies";
import { parseEventOccurrenceId, resolveGeneratedEventOccurrence } from "@/lib/event-occurrence";

import { eventCalendarResponse, locationToString } from "@/lib/event-ics";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

type EventIcsDependencies = {
    authenticate: typeof getAuthenticatedUserDid;
    findCircle: typeof getCircleByHandle;
    authorizeView: (viewerDid: string | undefined, circleId: string) => Promise<boolean>;
    findEvent: (id: ObjectId) => Promise<EventModel | null>;
    findOccurrence: (seriesId: string, occurrenceKey: number) => Promise<EventOccurrence | null>;
    hasOccurrenceInvitation: (seriesId: string, occurrenceKey: number, viewerDid: string) => Promise<boolean>;
    contentPolicyDependencies?: Parameters<typeof canReadEventContent>[2];
};

const defaultDependencies: EventIcsDependencies = {
    authenticate: getAuthenticatedUserDid,
    findCircle: getCircleByHandle,
    authorizeView: (viewerDid, circleId) => isAuthorized(viewerDid, circleId, features.events.view),
    findEvent: async (id) => (await Events.findOne({ _id: id })) as EventModel | null,
    findOccurrence: async (seriesId, occurrenceKey) => EventOccurrences.findOne({ seriesId, occurrenceKey }),
    hasOccurrenceInvitation: async (seriesId, occurrenceKey, userDid) =>
        Boolean(
            await EventOccurrenceInvitations.findOne({ seriesId, occurrenceKey, userDid }, { projection: { _id: 1 } }),
        ),
};

function createEventIcsGetHandler(dependencies: EventIcsDependencies = defaultDependencies) {
    return async function GET(
        req: Request,
        ctx: { params: Promise<{ handle: string; eventId: string }> },
    ): Promise<Response> {
        try {
            const deps = { ...dependencies, ...getEventIcsRouteOverrides() };
            const { handle, eventId } = await ctx.params;
            const occurrence = parseEventOccurrenceId(eventId);
            const lookupId = occurrence?.seriesId ?? eventId;
            if (!handle || !ObjectId.isValid(lookupId)) {
                return notFound();
            }

            const viewerDid = await deps.authenticate();
            const circle = await deps.findCircle(handle);
            if (!circle?._id || !isCirclePublished(circle) || !(await deps.authorizeView(viewerDid, String(circle._id)))) {
                return notFound();
            }

            const id = new ObjectId(lookupId);
            const seriesId = id.toHexString();
            const event = await deps.findEvent(id);
            if (!event) {
                return notFound();
            }

            const occurrenceInvitationEntitled =
                occurrence &&
                viewerDid &&
                event.visibility === "private" &&
                event.createdBy !== viewerDid &&
                (await deps.hasOccurrenceInvitation(seriesId, occurrence.occurrenceKey, viewerDid));
            if (
                !(await canReadEventContent(
                    event,
                    {
                        viewerDid,
                        routeHostId: String(circle._id),
                        requiredStage: "open",
                        preEntitledPrivateEventIds: occurrenceInvitationEntitled ? [seriesId] : [],
                    },
                    deps.contentPolicyDependencies,
                ))
            ) {
                return notFound();
            }

            let calendarEventId = seriesId;
            let { startAt, endAt } = event;
            if (occurrence) {
                if (!event.recurrence) return notFound();
                const state = await deps.findOccurrence(seriesId, occurrence.occurrenceKey);
                const resolved = resolveGeneratedEventOccurrence(
                    seriesId,
                    { startAt, endAt, recurrence: event.recurrence },
                    occurrence.originalStartAt,
                    state,
                );
                if (!resolved || resolved.isOccurrenceCancelled) return notFound();
                ({ startAt, endAt, occurrenceId: calendarEventId } = resolved);
            }

            const eventUrl = new URL(`/circles/${encodeURIComponent(handle)}/events/${calendarEventId}`, req.url);

            return eventCalendarResponse({
                title: event.title,
                description: [event.description, event.virtualUrl].filter(Boolean).join("\n\n"),
                location: event.isVirtual ? "Online" : locationToString(event.location),
                startAt,
                endAt,
                allDay: event.allDay,
                uid: `event-${calendarEventId}@${eventUrl.hostname}`,
                url: eventUrl.href,
            });
        } catch (err) {
            console.error("Error generating ICS:", err);
            return notFound();
        }
    };
}

export const GET = createEventIcsGetHandler();

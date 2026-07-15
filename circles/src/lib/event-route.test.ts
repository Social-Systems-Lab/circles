import assert from "node:assert/strict";
import type { EventDisplay } from "@/models/models";
import { getEventDetailHref, getEventRouteCircleHandle } from "@/lib/event-route";

const event = (overrides: Partial<EventDisplay> = {}): EventDisplay =>
    ({
        _id: "event-1",
        circleId: "host-circle-id",
        hostCircleIds: undefined,
        title: "Hosted Event",
        createdBy: "did:example:host",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        startAt: new Date("2026-01-02T10:00:00.000Z"),
        endAt: new Date("2026-01-02T11:00:00.000Z"),
        stage: "open",
        visibility: "public",
        userGroups: [],
        author: {} as EventDisplay["author"],
        circle: {
            _id: "host-circle-id",
            handle: "event-host",
            name: "Event Host",
        } as EventDisplay["circle"],
        ...overrides,
    }) as EventDisplay;

assert.equal(
    getEventDetailHref(event(), { id: "personal-profile-id", handle: "timolsson" }),
    "/circles/event-host/events/event-1#circle-tabs",
    "attended events shown in a personal calendar link to the actual event host",
);

assert.equal(
    getEventDetailHref(event(), { id: "host-circle-id", handle: "event-host" }),
    "/circles/event-host/events/event-1#circle-tabs",
    "events viewed in their own host circle keep the current host route",
);

assert.equal(
    getEventDetailHref(
        event({
            hostCircleIds: ["cohost-circle-id"],
        }),
        { id: "cohost-circle-id", handle: "cohost" },
    ),
    "/circles/cohost/events/event-1#circle-tabs",
    "multi-host events use the current route circle when it is a valid host",
);

assert.equal(
    getEventDetailHref(
        event({
            hostCircleIds: ["cohost-circle-id"],
        }),
        { id: "personal-profile-id", handle: "timolsson" },
    ),
    "/circles/event-host/events/event-1#circle-tabs",
    "multi-host events fall back deterministically to the primary event circle when the current route is not a host",
);

assert.equal(
    getEventRouteCircleHandle(
        event({
            circle: undefined,
            hostCircleIds: ["cohost-circle-id"],
        }),
        { id: "personal-profile-id", handle: "timolsson" },
    ),
    undefined,
    "a non-host personal profile handle is not used when no valid host handle is available",
);

assert.equal(
    getEventDetailHref(
        event({
            circle: undefined,
            hostCircleIds: ["cohost-circle-id"],
        }),
        { id: "personal-profile-id", handle: "timolsson" },
    ),
    undefined,
    "no event detail URL is returned when no valid host handle is available",
);

console.log("event-route tests passed");

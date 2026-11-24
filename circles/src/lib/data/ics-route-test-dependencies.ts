import { AsyncLocalStorage } from "node:async_hooks";
import type { ObjectId } from "mongodb";
import type { Circle, Event, EventOccurrence } from "@/models/models";
import type { EventContentReadPolicyDependencies, EventHostReadPolicyDependencies } from "./event-host-read-policy";

export type EventIcsRouteOverrides = {
    authenticate: () => Promise<string | undefined>;
    findCircle: (handle: string) => Promise<Circle | null>;
    authorizeView: (viewerDid: string | undefined, circleId: string) => Promise<boolean>;
    findEvent: (id: ObjectId) => Promise<Event | null>;
    findOccurrence: (seriesId: string, occurrenceKey: number) => Promise<EventOccurrence | null>;
    hasOccurrenceInvitation: (seriesId: string, occurrenceKey: number, viewerDid: string) => Promise<boolean>;
    contentPolicyDependencies: Partial<EventContentReadPolicyDependencies>;
};

export type CircleIcsRouteOverrides = {
    authenticate: () => Promise<string | undefined>;
    findCircle: (handle: string) => Promise<Circle | null>;
    findEvents: (circleId: string, query: { stage: "open"; endingAtOrAfter: Date; limit: 500 }) => Promise<Event[]>;
    circlePolicyDependencies: Pick<EventHostReadPolicyDependencies, "findMemberships">;
    contentPolicyDependencies: Partial<EventContentReadPolicyDependencies>;
};

const eventIcsOverrides = new AsyncLocalStorage<Partial<EventIcsRouteOverrides>>();
const circleIcsOverrides = new AsyncLocalStorage<Partial<CircleIcsRouteOverrides>>();

export const getEventIcsRouteOverrides = () => eventIcsOverrides.getStore();
export const getCircleIcsRouteOverrides = () => circleIcsOverrides.getStore();

export const withEventIcsRouteOverrides = <T>(overrides: Partial<EventIcsRouteOverrides>, run: () => T): T =>
    eventIcsOverrides.run(overrides, run);

export const withCircleIcsRouteOverrides = <T>(overrides: Partial<CircleIcsRouteOverrides>, run: () => T): T =>
    circleIcsOverrides.run(overrides, run);

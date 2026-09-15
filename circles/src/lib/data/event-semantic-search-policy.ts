import { ObjectId } from "mongodb";
import type { Event } from "@/models/models";
import { filterEventsByContentReadPolicy, type EventContentReadPolicyDependencies } from "./event-host-read-policy";

type SemanticResult = { _id: string; type: string };

export type EventSemanticSearchDependencies = {
    findEvents: (ids: ObjectId[]) => Promise<Event[]>;
    findPrivateEntitledEventIds: (viewerDid: string, eventIds: string[]) => Promise<string[]>;
    hostPolicyDependencies?: Partial<EventContentReadPolicyDependencies>;
};

const defaultDependencies: EventSemanticSearchDependencies = {
    findEvents: async (ids) => {
        const { Events } = await import("./db");
        return Events.find(
            { _id: { $in: ids } },
            { projection: { _id: 1, circleId: 1, hostCircleIds: 1, visibility: 1, createdBy: 1 } },
        ).toArray();
    },
    findPrivateEntitledEventIds: async (viewerDid, eventIds) => {
        const { EventInvitations, EventRsvps } = await import("./db");
        const [rsvps, invitations] = await Promise.all([
            EventRsvps.find(
                { userDid: viewerDid, eventId: { $in: eventIds } },
                { projection: { eventId: 1 } },
            ).toArray(),
            EventInvitations.find(
                { userDid: viewerDid, eventId: { $in: eventIds } },
                { projection: { eventId: 1 } },
            ).toArray(),
        ]);
        return [...rsvps, ...invitations].map((row) => row.eventId);
    },
};

/** Revalidates Event vector hits against current Mongo ownership and viewer host access. */
export async function filterReadableEventSemanticResults<TResult extends SemanticResult>(
    results: TResult[],
    viewerDid?: string,
    dependencies: EventSemanticSearchDependencies = defaultDependencies,
): Promise<TResult[]> {
    const eventResults = results.filter((result) => result.type === "event");
    if (eventResults.length === 0) return results;
    const validIds = Array.from(new Set(eventResults.map((result) => result._id).filter(ObjectId.isValid)));
    const events = validIds.length ? await dependencies.findEvents(validIds.map((id) => new ObjectId(id))) : [];
    const readable = await filterEventsByContentReadPolicy(
        events,
        { viewerDid },
        {
            ...(dependencies.hostPolicyDependencies || {}),
            findPrivateEntitledEventIds: dependencies.findPrivateEntitledEventIds,
        },
    );
    const readableIds = new Set(readable.map((event) => event._id?.toString()));
    return results.filter((result) => result.type !== "event" || readableIds.has(result._id));
}

export type EventSemanticResultPage<TResult> = {
    results: TResult[];
    nextOffset?: string | number;
    exhausted: boolean;
};

/** Pages through ranked Event hits until the visible limit is filled or Qdrant is exhausted. */
export async function backfillReadableEventSemanticResults<TResult extends SemanticResult>(options: {
    limit: number;
    viewerDid?: string;
    fetchPage: (offset: string | number | undefined, limit: number) => Promise<EventSemanticResultPage<TResult>>;
    dependencies?: EventSemanticSearchDependencies;
}): Promise<TResult[]> {
    if (options.limit <= 0) return [];
    const visible: TResult[] = [];
    const seenOffsets = new Set<string>();
    let offset: string | number | undefined;
    const batchSize = Math.max(options.limit, 20);

    while (visible.length < options.limit) {
        const offsetKey = offset === undefined ? "initial" : `${typeof offset}:${offset}`;
        if (seenOffsets.has(offsetKey)) throw new Error("Event semantic-search pagination did not advance.");
        seenOffsets.add(offsetKey);
        const page = await options.fetchPage(offset, batchSize);
        if (page.results.length > 0) {
            const readable = await filterReadableEventSemanticResults(
                page.results,
                options.viewerDid,
                options.dependencies,
            );
            visible.push(...readable);
        }
        if (page.exhausted || page.results.length === 0) break;
        const nextOffset = page.nextOffset;
        if (nextOffset === undefined) break;
        offset = nextOffset;
    }

    return visible.slice(0, options.limit);
}

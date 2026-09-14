import { ObjectId, type Document } from "mongodb";
import type { Circle, Event, Member } from "@/models/models";
import { canReadCircleByLifecycle } from "./circle-lifecycle-policy";
import { getCircleVisibility } from "./circle-visibility-policy";

type EventHostShape = Pick<Event, "circleId" | "hostCircleIds">;

export type EventHostReadPolicyDependencies = {
    findCircles: (circleIds: ObjectId[]) => Promise<Circle[]>;
    findMemberships: (viewerDid: string, circleIds: string[]) => Promise<Array<Pick<Member, "userDid" | "circleId">>>;
};

export type EventReaderHostPolicyDependencies = EventHostReadPolicyDependencies & {
    findEventCandidatePage: (
        match: Document,
        afterId: ObjectId | undefined,
        limit: number,
    ) => Promise<Array<Pick<Event, "_id" | "circleId" | "hostCircleIds">>>;
};

export const GLOBAL_EVENT_READ_BATCH_SIZE = 100;

const defaultDependencies: EventHostReadPolicyDependencies = {
    findCircles: async (circleIds) => {
        const { Circles } = await import("./db");
        return Circles.find(
            { _id: { $in: circleIds } },
            { projection: { _id: 1, circleType: 1, visibility: 1, moderationStatus: 1 } },
        ).toArray();
    },
    findMemberships: async (viewerDid, circleIds) => {
        const { Members } = await import("./db");
        return Members.find(
            { userDid: viewerDid, circleId: { $in: circleIds } },
            { projection: { userDid: 1, circleId: 1 } },
        ).toArray();
    },
};

/** Strict, primary-first normalization for legacy Event host state. */
export function normalizeEventHostsForRead(event: EventHostShape): string[] | null {
    if (typeof event.circleId !== "string" || !ObjectId.isValid(event.circleId)) return null;
    if (event.hostCircleIds !== undefined && event.hostCircleIds !== null && !Array.isArray(event.hostCircleIds)) {
        return null;
    }
    const candidates: unknown[] = [event.circleId, ...(event.hostCircleIds ?? [])];
    if (candidates.some((value) => typeof value !== "string" || !ObjectId.isValid(value))) return null;
    return Array.from(new Set(candidates.map((value) => new ObjectId(value as string).toHexString())));
}

/**
 * Filters global Event candidates through every authoritative host in two batch reads.
 * Missing/malformed hosts and non-readable host lifecycle states fail closed.
 */
export async function filterEventsByReadableHosts<TEvent extends EventHostShape>(
    events: TEvent[],
    viewerDid?: string,
    dependencies: EventHostReadPolicyDependencies = defaultDependencies,
): Promise<TEvent[]> {
    const hostsByEvent = new Map<TEvent, string[] | null>();
    const allHostIds = new Set<string>();
    for (const event of events) {
        const hostIds = normalizeEventHostsForRead(event);
        hostsByEvent.set(event, hostIds);
        hostIds?.forEach((hostId) => allHostIds.add(hostId));
    }
    if (allHostIds.size === 0) return [];

    const hostIds = Array.from(allHostIds);
    const circles = await dependencies.findCircles(hostIds.map((hostId) => new ObjectId(hostId)));
    const circlesById = new Map(circles.map((circle) => [circle._id?.toString(), circle]));
    const secretHostIds = hostIds.filter((hostId) => getCircleVisibility(circlesById.get(hostId)) === "secret");
    const memberships =
        viewerDid && secretHostIds.length ? await dependencies.findMemberships(viewerDid, secretHostIds) : [];
    const memberHostIds = new Set(
        memberships
            .filter((member) => member.userDid === viewerDid && secretHostIds.includes(member.circleId))
            .map((member) => member.circleId),
    );

    return events.filter((event) => {
        const eventHostIds = hostsByEvent.get(event);
        return Boolean(
            eventHostIds?.length &&
                eventHostIds.every((hostId) => {
                    const circle = circlesById.get(hostId);
                    if (!circle || !canReadCircleByLifecycle(circle)) return false;
                    if (
                        circle.circleType !== "user" &&
                        circle.visibility !== undefined &&
                        circle.visibility !== "public" &&
                        circle.visibility !== "secret"
                    ) {
                        return false;
                    }
                    return getCircleVisibility(circle) !== "secret" || memberHostIds.has(hostId);
                }),
        );
    });
}

/**
 * Streams host-authorized Event IDs to global readers in bounded batches.
 * The callback never receives more than one page of IDs, so readers never build an unbounded $in.
 */
export async function forEachReadableGlobalEventBatch(
    baseMatch: Document,
    viewerDid: string | undefined,
    visit: (eventIds: ObjectId[]) => Promise<void>,
    dependencies?: EventReaderHostPolicyDependencies,
    batchSize = GLOBAL_EVENT_READ_BATCH_SIZE,
): Promise<void> {
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
        throw new Error("Global Event read batch size must be a positive safe integer.");
    }
    const deps =
        dependencies ??
        ({
            ...defaultDependencies,
            findEventCandidatePage: async (match: Document, afterId: ObjectId | undefined, limit: number) => {
                const { Events } = await import("./db");
                const pageMatch = afterId ? { $and: [match, { _id: { $gt: afterId } }] } : match;
                return Events.find(pageMatch, { projection: { _id: 1, circleId: 1, hostCircleIds: 1 } })
                    .sort({ _id: 1 })
                    .limit(limit)
                    .toArray();
            },
        } satisfies EventReaderHostPolicyDependencies);
    let afterId: ObjectId | undefined;
    while (true) {
        const candidates = await deps.findEventCandidatePage(baseMatch, afterId, batchSize);
        if (candidates.length === 0) return;
        const lastId = candidates.at(-1)?._id;
        if (
            !(lastId instanceof ObjectId) ||
            (afterId && lastId.toHexString().localeCompare(afterId.toHexString()) <= 0)
        ) {
            throw new Error("Global Event candidate pagination did not advance.");
        }
        const readable = await filterEventsByReadableHosts(candidates, viewerDid, deps);
        if (readable.length > 0) {
            await visit(readable.map((event) => event._id));
        }
        if (candidates.length < batchSize) return;
        afterId = lastId;
    }
}

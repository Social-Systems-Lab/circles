import { ObjectId } from "mongodb";
import type { Circle, Event, Member } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { getCircleVisibility } from "./circle-visibility-policy";

export const EVENT_HOSTS_UNAVAILABLE = "One or more selected host circles are unavailable.";

export type EventHostWriteDependencies = {
    getCircles: (ids: string[]) => Promise<Circle[]>;
    getCanonicalMember: (actorDid: string, circleId: string) => Promise<Member | null>;
};

const defaultDependencies: EventHostWriteDependencies = {
    getCircles: async (ids) => {
        const { getCirclesByIds } = await import("./circle");
        return getCirclesByIds(ids);
    },
    getCanonicalMember: async (actorDid, circleId) => {
        const { getMember } = await import("./member");
        return getMember(actorDid, circleId);
    },
};

export type WritableEventHosts = {
    hostCircleIds: string[];
    hostCircles: Circle[];
    visibility: "public" | "secret";
};

/** Runs an operation only after the production Event host policy has accepted the complete host set. */
export async function withWritableEventHosts<T>(
    event: Pick<Event, "circleId"> & { hostCircleIds?: unknown },
    actorDid: string,
    operation: (hosts: WritableEventHosts) => Promise<T>,
    dependencies: EventHostWriteDependencies = defaultDependencies,
): Promise<T> {
    const hosts = await resolveWritableEventHosts(event, actorDid, dependencies);
    return operation(hosts);
}

/** Production create boundary: no feature authorization or create effect runs before host approval. */
export function withWritableEventHostsForCreate<T>(
    event: Pick<Event, "circleId"> & { hostCircleIds?: unknown },
    actorDid: string,
    operation: (hosts: WritableEventHosts) => Promise<T>,
    dependencies: EventHostWriteDependencies = defaultDependencies,
): Promise<T> {
    return withWritableEventHosts(event, actorDid, operation, dependencies);
}

/** Production update boundary: no media reconciliation or update effect runs before host approval. */
export function withWritableEventHostsForUpdate<T>(
    event: Pick<Event, "circleId"> & { hostCircleIds?: unknown },
    actorDid: string,
    operation: (hosts: WritableEventHosts) => Promise<T>,
    dependencies: EventHostWriteDependencies = defaultDependencies,
): Promise<T> {
    return withWritableEventHosts(event, actorDid, operation, dependencies);
}

/** Production stage boundary: no stage/publication effect runs before host approval. */
export function withWritableEventHostsForStageTransition<T>(
    event: Pick<Event, "circleId"> & { hostCircleIds?: unknown },
    actorDid: string,
    operation: (hosts: WritableEventHosts) => Promise<T>,
    dependencies: EventHostWriteDependencies = defaultDependencies,
): Promise<T> {
    return withWritableEventHosts(event, actorDid, operation, dependencies);
}

/** Canonicalizes and authorizes the complete Event host set before any write side effects. */
export async function resolveWritableEventHosts(
    event: Pick<Event, "circleId"> & { hostCircleIds?: unknown },
    actorDid: string,
    dependencies: EventHostWriteDependencies = defaultDependencies,
): Promise<WritableEventHosts> {
    const unavailable = () => new Error(EVENT_HOSTS_UNAVAILABLE);
    if (typeof event.circleId !== "string" || !ObjectId.isValid(event.circleId)) throw unavailable();
    if (event.hostCircleIds !== undefined && event.hostCircleIds !== null && !Array.isArray(event.hostCircleIds)) {
        throw unavailable();
    }

    const rawHostIds: unknown[] = [event.circleId, ...((event.hostCircleIds ?? []) as unknown[])];
    if (rawHostIds.some((id) => typeof id !== "string" || !ObjectId.isValid(id))) throw unavailable();
    const hostCircleIds = Array.from(new Set((rawHostIds as string[]).map((id) => new ObjectId(id).toHexString())));

    const circles = await dependencies.getCircles(hostCircleIds);
    const circleById = new Map(
        circles
            .filter((circle) => circle._id && ObjectId.isValid(String(circle._id)))
            .map((circle) => [new ObjectId(String(circle._id)).toHexString(), circle]),
    );
    const hostCircles = hostCircleIds.map((id) => circleById.get(id));
    if (hostCircles.some((circle) => !circle)) throw unavailable();

    const canonicalHostCircles = hostCircles as Circle[];
    const visibilities = new Set(canonicalHostCircles.map(getCircleVisibility));
    if (visibilities.size !== 1) throw unavailable();
    const visibility = getCircleVisibility(canonicalHostCircles[0]);

    if (canonicalHostCircles.some((circle) => !canWriteCircleByLifecycle(circle))) throw unavailable();
    if (visibility === "secret") {
        const memberships = await Promise.all(
            hostCircleIds.map((circleId) => dependencies.getCanonicalMember(actorDid, circleId)),
        );
        if (
            memberships.some(
                (member, index) => member?.userDid !== actorDid || member.circleId !== hostCircleIds[index],
            )
        ) {
            throw unavailable();
        }
    }

    return { hostCircleIds, hostCircles: canonicalHostCircles, visibility };
}

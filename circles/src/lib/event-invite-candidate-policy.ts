import type { Circle, Event, Member } from "@/models/models";
import { features } from "@/lib/data/constants";

type CandidateCircle = Pick<Circle, "_id" | "accessRules">;
type CandidateEvent = Pick<Event, "circleId" | "hostCircleIds" | "createdBy" | "stage">;

export type EventInviteCandidateAccessDependencies = {
    getAuthenticatedUserDid: () => Promise<string | null | undefined>;
    getRouteCircle: (handle: string) => Promise<CandidateCircle | null | undefined>;
    getEvent: (eventId: string, userDid: string) => Promise<CandidateEvent | null | undefined>;
    getHostCircle: (circleId: string) => Promise<CandidateCircle | null | undefined>;
    getMembership: (userDid: string, circleId: string) => Promise<Pick<Member, "userGroups"> | null | undefined>;
    isFeatureAuthorized: (
        userDid: string,
        circleId: string,
        feature: typeof features.events.review,
    ) => Promise<boolean>;
    assertHostCirclesWritable: (event: CandidateEvent) => Promise<void>;
};

const getHostCircleIds = (event: CandidateEvent) =>
    Array.from(new Set([event.circleId, ...(event.hostCircleIds || [])].filter(Boolean)));

const getAllowedMemberGroups = (circle: CandidateCircle, feature: typeof features.events.review): string[] =>
    (circle.accessRules?.[feature.module]?.[feature.handle] ?? feature.defaultUserGroups ?? []).filter(
        (group) => group !== "everyone",
    );

async function hasMemberBasedFeatureAuthority(
    userDid: string,
    circleId: string,
    circle: CandidateCircle,
    membership: Pick<Member, "userGroups">,
    feature: typeof features.events.review,
    deps: EventInviteCandidateAccessDependencies,
): Promise<boolean> {
    const permittedGroups = getAllowedMemberGroups(circle, feature);
    if (!permittedGroups.some((group) => (membership.userGroups ?? []).includes(group))) return false;
    return deps.isFeatureAuthorized(userDid, circleId, feature);
}

export async function hasEventInviteCandidateAuthority(
    userDid: string,
    event: CandidateEvent,
    deps: EventInviteCandidateAccessDependencies,
): Promise<boolean> {
    if (event.createdBy === userDid) return true;

    const checks = await Promise.all(
        getHostCircleIds(event).map(async (circleId) => {
            const [circle, membership] = await Promise.all([
                deps.getHostCircle(circleId),
                deps.getMembership(userDid, circleId),
            ]);
            if (!circle || !membership) return false;
            return (
                (await hasMemberBasedFeatureAuthority(
                    userDid,
                    circleId,
                    circle,
                    membership,
                    features.events.review,
                    deps,
                )) ||
                (await hasMemberBasedFeatureAuthority(
                    userDid,
                    circleId,
                    circle,
                    membership,
                    features.events.moderate,
                    deps,
                ))
            );
        }),
    );
    return checks.some(Boolean);
}

export async function resolveEventInviteCandidateAccess(
    circleHandle: string,
    eventId: string,
    deps: EventInviteCandidateAccessDependencies,
): Promise<{ userDid: string; circle: CandidateCircle; event: CandidateEvent } | null> {
    const userDid = await deps.getAuthenticatedUserDid();
    if (!userDid) return null;

    const circle = await deps.getRouteCircle(circleHandle);
    if (!circle?._id) return null;

    const event = await deps.getEvent(eventId, userDid);
    if (!event || event.stage !== "open" || !getHostCircleIds(event).includes(circle._id.toString())) return null;
    if (!(await hasEventInviteCandidateAuthority(userDid, event, deps))) return null;

    await deps.assertHostCirclesWritable(event);
    return { userDid, circle, event };
}

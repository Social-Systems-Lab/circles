import "server-only";

import { ObjectId } from "mongodb";
import { isAuthorized } from "@/lib/auth/auth";
import { Circles, Members, UserRelationships } from "@/lib/data/db";
import { features } from "@/lib/data/constants";
import {
    EventInviteCandidateDto,
    EventInviteCandidateSource,
    toEventInviteCandidateDto,
} from "@/lib/event-invite-candidate";

type CandidateProfile = {
    did?: string;
    name?: string;
    handle?: string;
    picture?: { url?: string };
};

const candidateProjection = {
    _id: 0,
    did: 1,
    name: 1,
    handle: 1,
    "picture.url": 1,
} as const;

const addCandidate = (
    candidatesByDid: Map<string, EventInviteCandidateDto>,
    profile: CandidateProfile,
    source: EventInviteCandidateSource,
) => {
    const existing = profile.did ? candidatesByDid.get(profile.did) : undefined;
    const candidate = toEventInviteCandidateDto(profile, [...(existing?.inviteSources || []), source]);
    if (candidate) candidatesByDid.set(candidate.did, candidate);
};

const matchesQuery = (candidate: EventInviteCandidateDto, query?: string) => {
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return (
        candidate.name.toLowerCase().includes(normalizedQuery) ||
        Boolean(candidate.handle?.toLowerCase().includes(normalizedQuery))
    );
};

export async function getEligibleCircleMemberEventInviteCandidates(
    circleId: string,
    inviterDid: string,
): Promise<EventInviteCandidateDto[]> {
    if (!ObjectId.isValid(circleId)) return [];

    const memberships = await Members.find({ circleId }, { projection: { _id: 0, userDid: 1 } }).toArray();
    const memberDids = Array.from(new Set(memberships.map((member) => member.userDid).filter(Boolean)));
    if (memberDids.length === 0) return [];

    const profiles = await Circles.find(
        { did: { $in: memberDids }, circleType: "user" },
        { projection: candidateProjection },
    ).toArray();
    const eligibility = await Promise.all(
        profiles.map((profile) =>
            profile.did ? isAuthorized(profile.did, circleId, features.events.view) : Promise.resolve(false),
        ),
    );

    return profiles
        .filter((_, index) => eligibility[index])
        .flatMap((profile) => {
            const candidate = toEventInviteCandidateDto(profile, ["circle_member"]);
            return candidate && candidate.did !== inviterDid ? [candidate] : [];
        })
        .sort((a, b) => (a.name || a.handle || "").localeCompare(b.name || b.handle || ""));
}

async function getAcceptedContactEventInviteCandidates(userDid: string): Promise<EventInviteCandidateDto[]> {
    const relationshipEdges = await UserRelationships.find(
        { fromDid: userDid, connectStatus: "accepted" },
        { projection: { _id: 0, toDid: 1 } },
    ).toArray();
    const acceptedDids = Array.from(
        new Set(
            relationshipEdges
                .map((edge) => (typeof edge.toDid === "string" ? edge.toDid : ""))
                .filter((did) => did && did !== userDid),
        ),
    );
    if (acceptedDids.length === 0) return [];

    const profiles = await Circles.find(
        { did: { $in: acceptedDids }, circleType: "user" },
        { projection: candidateProjection },
    ).toArray();
    return profiles.flatMap((profile) => {
        const candidate = toEventInviteCandidateDto(profile, ["contact"]);
        return candidate ? [candidate] : [];
    });
}

export async function getEligibleEventInviteCandidates({
    circleId,
    isUserCircle,
    inviterDid,
    query,
    limit = 100,
}: {
    circleId: string;
    isUserCircle: boolean;
    inviterDid: string;
    query?: string;
    limit?: number;
}): Promise<EventInviteCandidateDto[]> {
    const [members, contacts] = await Promise.all([
        isUserCircle ? Promise.resolve([]) : getEligibleCircleMemberEventInviteCandidates(circleId, inviterDid),
        getAcceptedContactEventInviteCandidates(inviterDid),
    ]);
    const candidatesByDid = new Map<string, EventInviteCandidateDto>();
    members.forEach((candidate) => addCandidate(candidatesByDid, candidate, "circle_member"));
    contacts.forEach((candidate) => addCandidate(candidatesByDid, candidate, "contact"));

    return Array.from(candidatesByDid.values())
        .filter((candidate) => matchesQuery(candidate, query))
        .sort((a, b) => (a.name || a.handle || "").localeCompare(b.name || b.handle || ""))
        .slice(0, Math.max(0, limit));
}

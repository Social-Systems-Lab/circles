export type EventInviteCandidateSource = "circle_member" | "contact";

export type EventInviteCandidateDto = {
    did: string;
    name: string;
    handle?: string;
    picture?: {
        url: string;
    };
    inviteSources: EventInviteCandidateSource[];
    inviteSourceLabel: string;
};

export const getEventInviteSourceLabel = (sources: EventInviteCandidateSource[]) => {
    const uniqueSources = Array.from(new Set(sources));
    if (uniqueSources.includes("circle_member") && uniqueSources.includes("contact")) {
        return "Circle member + Contact";
    }
    if (uniqueSources.includes("circle_member")) return "Circle member";
    return "Contact";
};

export const toEventInviteCandidateDto = (
    candidate: { did?: unknown; name?: unknown; handle?: unknown; picture?: { url?: unknown } | null },
    inviteSources: EventInviteCandidateSource[],
): EventInviteCandidateDto | null => {
    if (typeof candidate.did !== "string" || typeof candidate.name !== "string") return null;

    const normalizedSources = Array.from(new Set(inviteSources));
    return {
        did: candidate.did,
        name: candidate.name,
        ...(typeof candidate.handle === "string" ? { handle: candidate.handle } : {}),
        ...(typeof candidate.picture?.url === "string" ? { picture: { url: candidate.picture.url } } : {}),
        inviteSources: normalizedSources,
        inviteSourceLabel: getEventInviteSourceLabel(normalizedSources),
    };
};

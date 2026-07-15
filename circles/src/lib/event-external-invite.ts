import type { Circle } from "@/models/models";

export const EXTERNAL_EVENT_INVITE_ERRORS = {
    notFound: "No Kamooni member was found for that profile link or handle.",
    duplicate: "This person has already been invited.",
    cannotInvite: "This profile cannot be invited.",
    unauthorized: "You do not have permission to invite people to this event.",
} as const;

export type ExternalEventInviteValidationInput = {
    target?: Partial<Circle> | null;
    inviterDid?: string | null;
    alreadyInvited?: boolean;
    alreadyAttending?: boolean;
};

// Mirrors personal-profile signup validation in signup-form, pilot-signup-form, and onboarding-signup-flow.
const HANDLE_PATTERN = /^[a-z0-9-]{3,20}$/;
const KAMOONI_HOSTS = new Set(["kamooni.org", "www.kamooni.org"]);

export function resolveExternalEventInviteHandle(input: string): string | null {
    const value = input.trim();
    if (!value) {
        return null;
    }

    if (value.startsWith("@")) {
        return normalizeHandle(value.slice(1));
    }

    if (/^https?:\/\//i.test(value)) {
        return normalizeKamooniProfileUrl(value);
    }

    if (value.includes("/") || value.includes(".") || value.includes(":")) {
        return null;
    }

    return normalizeHandle(value);
}

export function getExternalEventInviteProfileError(input: ExternalEventInviteValidationInput): string | null {
    const target = input.target;

    if (!target) {
        return EXTERNAL_EVENT_INVITE_ERRORS.notFound;
    }

    if (!target.did || target.circleType !== "user" || target.accountStatus === "rejected") {
        return EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite;
    }

    if (input.inviterDid && target.did === input.inviterDid) {
        return EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite;
    }

    if (input.alreadyInvited) {
        return EXTERNAL_EVENT_INVITE_ERRORS.duplicate;
    }

    if (input.alreadyAttending) {
        return EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite;
    }

    return null;
}

function normalizeKamooniProfileUrl(input: string): string | null {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        return null;
    }

    if (!KAMOONI_HOSTS.has(url.hostname.toLowerCase())) {
        return null;
    }

    if (url.protocol !== "https:") {
        return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "circles") {
        return null;
    }

    return normalizeHandle(parts[1]);
}

function normalizeHandle(handle: string): string | null {
    const normalized = handle.trim().toLowerCase();
    return HANDLE_PATTERN.test(normalized) ? normalized : null;
}

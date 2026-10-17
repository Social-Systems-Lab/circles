import type { Circle } from "@/models/models";
import { resolveKamooniProfileHandle } from "@/lib/profile-reference";

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

export const resolveExternalEventInviteHandle = resolveKamooniProfileHandle;

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

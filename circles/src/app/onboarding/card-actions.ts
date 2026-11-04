"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { updateCircle } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import { hasAcceptedAllCommunityGuidelines, type CommunityGuidelineAgreementState } from "@/lib/community-guidelines";
import {
    acceptMissingCommunityGuidelines,
    normalizeOnboardingIntroduction,
    validateOnboardingLocation,
} from "@/lib/onboarding/card-policies";
import { preparePersonalLocationForSave } from "@/lib/location-privacy";
import type { Location } from "@/models/models";
import { revalidatePath } from "next/cache";

type CardSaveResult<T = undefined> = { success: boolean; message: string; value?: T };

const getOwnPersonalProfile = async () => {
    const did = await getAuthenticatedUserDid();
    if (!did) return null;
    const profile = await getUserPrivate(did);
    if (!profile?._id || profile.circleType !== "user" || profile.did !== did) return null;
    return { did, profile };
};

export async function saveOnboardingIntroductionAction(value: unknown): Promise<CardSaveResult<string>> {
    const introduction = normalizeOnboardingIntroduction(value);
    if (introduction === null) {
        return { success: false, message: "Write a short introduction before saving." };
    }

    try {
        const own = await getOwnPersonalProfile();
        if (!own) return { success: false, message: "Please sign in to edit your profile." };
        await updateCircle({ _id: own.profile._id, description: introduction }, own.did);
        revalidatePath("/onboarding");
        if (own.profile.handle) revalidatePath(`/circles/${own.profile.handle}`);
        return { success: true, message: "Introduction saved.", value: introduction };
    } catch {
        return { success: false, message: "We couldn’t save your introduction. Please try again." };
    }
}

export async function saveOnboardingLocationAction(value: unknown): Promise<CardSaveResult<Location>> {
    try {
        const own = await getOwnPersonalProfile();
        if (!own) return { success: false, message: "Please sign in to edit your profile." };
        const prepared = preparePersonalLocationForSave(value, own.profile.location);
        const location = prepared.valid ? validateOnboardingLocation(prepared.location) : null;
        if (!location) return { success: false, message: "Choose a place on the map before saving your location." };
        await updateCircle({ _id: own.profile._id, location }, own.did);
        revalidatePath("/onboarding");
        if (own.profile.handle) revalidatePath(`/circles/${own.profile.handle}`);
        return { success: true, message: "Location saved.", value: location };
    } catch {
        return { success: false, message: "We couldn’t save your location. Please try again." };
    }
}

export async function acceptOnboardingCommunityGuidelinesAction(
    accepted: unknown,
): Promise<CardSaveResult<CommunityGuidelineAgreementState>> {
    if (accepted !== true) return { success: false, message: "Confirm your agreement before continuing." };

    try {
        const own = await getOwnPersonalProfile();
        if (!own) return { success: false, message: "Please sign in to accept the Community Guidelines." };
        const now = new Date();
        const acceptance = acceptMissingCommunityGuidelines(own.profile.communityGuidelinesAcceptance, now);
        if (!hasAcceptedAllCommunityGuidelines(acceptance)) {
            return { success: false, message: "All Community Guidelines must be accepted." };
        }
        await updateCircle(
            {
                _id: own.profile._id,
                communityGuidelinesAcceptance: acceptance,
                communityGuidelinesAcceptedAt: own.profile.communityGuidelinesAcceptedAt ?? now,
            },
            own.did,
        );
        revalidatePath("/onboarding");
        return { success: true, message: "Community Guidelines accepted.", value: acceptance };
    } catch {
        return { success: false, message: "We couldn’t save your agreement. Please try again." };
    }
}

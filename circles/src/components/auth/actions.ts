// actions.ts
"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { updateCircle } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import {
    COMMUNITY_GUIDELINE_RULE_IDS,
    CommunityGuidelineRuleId,
    hasAcceptedAllCommunityGuidelines,
    isAcceptedCommunityGuidelineRule,
    normalizeCommunityGuidelineAgreementState,
} from "@/lib/community-guidelines";
import { Challenge, UserPrivate } from "@/models/models";
import { getAuthCookieNamesForClearing, readAuthToken } from "@/lib/auth/cookie";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

type CheckAuthResponse = {
    user?: UserPrivate;
    authenticated: boolean;
    challenge?: Challenge;
};

export async function checkAuth(): Promise<CheckAuthResponse> {
    const token = readAuthToken(await cookies());

    try {
        if (token) {
            let payload = await verifyUserToken(token);
            if (payload) {
                // user is authenticated
                let user = await getUserPrivate(payload.userDid as string);

                return { user, authenticated: true };
            }
        }
    } catch (error) {
        console.error("Error verifying token", error);
    }

    return { user: undefined, authenticated: false };
}

export async function logOut(): Promise<void> {
    // clear session
    const cookieStore = await cookies();
    for (const cookieName of getAuthCookieNamesForClearing()) {
        cookieStore.set(cookieName, "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });
    }

    // clear cache
    revalidatePath(`/`);
}

type AcceptCommunityGuidelineResponse = {
    success: boolean;
    message: string;
    user?: UserPrivate;
};

export async function acceptCommunityGuidelineAction(
    ruleId: CommunityGuidelineRuleId,
): Promise<AcceptCommunityGuidelineResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to continue." };
    }

    if (!COMMUNITY_GUIDELINE_RULE_IDS.includes(ruleId)) {
        return { success: false, message: "That community rule is not recognized." };
    }

    try {
        const user = await getUserPrivate(userDid);
        if (!user?._id) {
            return { success: false, message: "User not found." };
        }

        const now = new Date();
        const nextAcceptanceState = normalizeCommunityGuidelineAgreementState(user.communityGuidelinesAcceptance);

        if (!isAcceptedCommunityGuidelineRule(nextAcceptanceState[ruleId])) {
            nextAcceptanceState[ruleId] = {
                accepted: true,
                acceptedAt: now,
            };
        }

        const updatePayload: Partial<UserPrivate> = {
            _id: user._id,
            communityGuidelinesAcceptance: nextAcceptanceState,
        };

        if (hasAcceptedAllCommunityGuidelines(nextAcceptanceState)) {
            updatePayload.communityGuidelinesAcceptedAt = user.communityGuidelinesAcceptedAt ?? now;
        }

        await updateCircle(updatePayload, userDid);

        const updatedUser = await getUserPrivate(userDid);

        return {
            success: true,
            message: "Community rule accepted.",
            user: updatedUser,
        };
    } catch (error) {
        console.error("Error in acceptCommunityGuidelineAction:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not save your agreement.",
        };
    }
}

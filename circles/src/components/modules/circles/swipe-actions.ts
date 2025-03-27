"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCirclePath, updateCircle } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { getPrivateUserByDid, getUserByDid } from "@/lib/data/user";
import { Circle } from "@/models/models";
import { revalidatePath } from "next/cache";

type CompleteSwipeOnboardingResponse = {
    success: boolean;
    message: string;
};

export const completeSwipeOnboardingAction = async (): Promise<CompleteSwipeOnboardingResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        // Add swipe step to completedOnboardingSteps
        let user = await getPrivateUserByDid(userDid);
        let circle: Partial<Circle> = {
            _id: user._id,
            completedOnboardingSteps: user.completedOnboardingSteps ?? [],
        };

        if (!circle.completedOnboardingSteps?.includes("swipe")) {
            circle.completedOnboardingSteps?.push("swipe");
        }

        await updateCircle(circle);

        // Clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath);

        return { success: true, message: "Swipe onboarding completed" };
    } catch (error) {
        console.log("error", error);
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to update swipe onboarding status. " + error };
        }
    }
};

"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { features } from "@/lib/data/constants";

export async function savePresence(data: Circle): Promise<FormSubmitResponse> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }
        if (!(await isAuthorized(userDid, data._id ?? "", features.settings.edit_about))) {
            throw new Error("Not authorized to edit circle settings");
        }

        const engagementInterests = data.engagements?.interests;
        const engagementSettings: Circle["engagements"] = data.engagements ? { ...data.engagements } : undefined;

        if (engagementSettings) {
            delete engagementSettings.interests;
        }

        await updateCircle(
            {
                _id: data._id,
                interests: engagementInterests,
                offers: data.offers,
                engagements: engagementSettings,
                needs: data.needs,
            },
            userDid,
        );

        revalidatePath(`/circles/${data.handle}/settings/presence`);
        revalidatePath(`/circles/${data.handle}/home`);
        revalidatePath(`/circles/${data.handle}`);

        return {
            success: true,
            message: "Presence settings updated successfully",
        };
    } catch (error) {
        console.error("Error saving presence settings:", error);
        return {
            success: false,
            message: "Failed to update presence settings",
        };
    }
}

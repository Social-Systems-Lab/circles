"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";

export async function savePresence(data: Circle): Promise<FormSubmitResponse> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }

        await updateCircle(
            {
                _id: data._id,
                offers: data.offers,
                engagements: data.engagements,
                needs: data.needs,
            },
            userDid,
        );

        revalidatePath(`/circles/${data.handle}/settings/presence`);
        revalidatePath(`/circles/${data.handle}/home`);

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

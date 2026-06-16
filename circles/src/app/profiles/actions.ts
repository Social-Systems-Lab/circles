"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCircleById, updateCircle } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { isPeerifyManagedIdentity } from "@/lib/peerify/artist-profile";

type PublishManagedPeerifyIdentityResult = {
    success: boolean;
    message: string;
};

export async function publishManagedPeerifyIdentityAction(circleId: string): Promise<PublishManagedPeerifyIdentityResult> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to publish this profile." };
    }

    const circle = await getCircleById(circleId);
    if (!circle?._id) {
        return { success: false, message: "Profile not found." };
    }

    if (!isPeerifyManagedIdentity(circle)) {
        return { success: false, message: "Only managed Peerify profiles can be published here." };
    }

    const authorized = await isAuthorized(userDid, circle._id, features.settings.edit_about);
    if (!authorized) {
        return { success: false, message: "You are not authorized to publish this profile." };
    }

    if (circle.publishStatus === "published") {
        return { success: true, message: "Profile is already published." };
    }

    await updateCircle({ _id: circle._id, publishStatus: "published" }, userDid);

    revalidatePath("/profiles");
    if (circle.handle) {
        revalidatePath(`/circles/${circle.handle}`);
        revalidatePath(`/circles/${circle.handle}/home`);
        revalidatePath(`/circles/${circle.handle}/settings/about`);
    }

    return { success: true, message: "Profile published." };
}

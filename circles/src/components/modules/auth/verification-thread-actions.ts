"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import {
    addApplicantVerificationMessage,
    getApplicantVerificationThread,
    getVerificationAdmins,
    notifyAdminsOfApplicantVerificationReply,
} from "@/lib/data/verification-workflow";

export async function getApplicantVerificationThreadAction() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized");
    }

    return await getApplicantVerificationThread(userDid);
}

export async function replyToVerificationThreadAction(formData: FormData) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized" };
    }

    const requestIdValue = formData.get("requestId");
    const bodyValue = formData.get("body");
    const files = formData
        .getAll("attachments")
        .filter((value): value is File => value instanceof File && value.size > 0);

    if (typeof requestIdValue !== "string" || !requestIdValue) {
        return { success: false, message: "Verification request not found." };
    }

    const body = typeof bodyValue === "string" ? bodyValue : "";

    try {
        const result = await addApplicantVerificationMessage({
            requestId: requestIdValue,
            applicantDid: userDid,
            body,
            files,
        });

        const admins = await getVerificationAdmins(userDid);
        await notifyAdminsOfApplicantVerificationReply(result.applicant, admins);

        if (result.applicant.handle) {
            revalidatePath(`/circles/${result.applicant.handle}/settings/subscription`);
        }
        revalidatePath("/admin");

        return { success: true, message: "Reply sent." };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not send reply.",
        };
    }
}

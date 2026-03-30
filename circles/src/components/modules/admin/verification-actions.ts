"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import {
    addAdminVerificationMessage,
    approveVerificationRequest,
    getAdminVerificationRequestDetail,
    listAdminVerificationRequests,
    notifyApplicantOfVerificationApproval,
    notifyApplicantOfVerificationRejection,
    notifyApplicantVerificationClarification,
    rejectVerificationRequest,
} from "@/lib/data/verification-workflow";

const requireAdminDid = async (): Promise<string> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized");
    }

    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized");
    }

    return userDid;
};

export async function getVerificationRequestsAction() {
    await requireAdminDid();
    return await listAdminVerificationRequests();
}

export async function getVerificationRequestDetailAction(requestId: string) {
    await requireAdminDid();
    return await getAdminVerificationRequestDetail(requestId);
}

export async function requestMoreVerificationInfoAction(requestId: string, body: string) {
    try {
        const adminDid = await requireAdminDid();
        const result = await addAdminVerificationMessage({ requestId, adminDid, body });
        await notifyApplicantVerificationClarification(result.applicant, result.admin);

        if (result.applicant.handle) {
            revalidatePath(`/circles/${result.applicant.handle}/settings/subscription`);
        }
        revalidatePath("/admin");

        return { success: true, message: "Clarification request sent." };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not send clarification request.",
        };
    }
}

export async function approveVerificationRequestAction(requestId: string) {
    try {
        const adminDid = await requireAdminDid();
        const result = await approveVerificationRequest({ requestId, adminDid });
        await notifyApplicantOfVerificationApproval(result.applicant);

        if (result.applicant.handle) {
            revalidatePath(`/circles/${result.applicant.handle}/settings/subscription`);
        }
        revalidatePath("/admin");

        return { success: true, message: "Verification request approved." };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not approve verification request.",
        };
    }
}

export async function rejectVerificationRequestAction(requestId: string, reason: string) {
    try {
        const adminDid = await requireAdminDid();
        const result = await rejectVerificationRequest({ requestId, adminDid, reason });
        await notifyApplicantOfVerificationRejection(result.applicant, reason);

        if (result.applicant.handle) {
            revalidatePath(`/circles/${result.applicant.handle}/settings/subscription`);
        }
        revalidatePath("/admin");

        return { success: true, message: "Verification request rejected." };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not reject verification request.",
        };
    }
}

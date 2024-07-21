"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCirclePath } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import {
    getAllMembershipRequests,
    getMembershipRequests,
    getRejectedRequests,
    updateMembershipRequestStatus,
} from "@/lib/data/membership-requests";
import { Circle, MembershipRequest, Page } from "@/models/models";
import { revalidatePath } from "next/cache";

type MembershipRequestsResponse = {
    success: boolean;
    message?: string;
    pendingRequests?: MembershipRequest[];
    rejectedRequests?: MembershipRequest[];
};

export const getAllMembershipRequestsAction = async (circleId: string): Promise<MembershipRequestsResponse> => {
    try {
        if (!circleId) {
            return { success: false, message: "Invalid circle ID" };
        }

        const userDid = await getAuthenticatedUserDid();

        // check if the user is authorized to view membership requests
        const authorized = await isAuthorized(userDid, circleId, features.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to view membership requests" };
        }

        const { pendingRequests, rejectedRequests } = await getAllMembershipRequests(circleId);
        return { success: true, pendingRequests, rejectedRequests };
    } catch (error) {
        return { success: false, message: "Failed to fetch membership requests. " + error?.toString() };
    }
};

type UpdateMembershipRequestResponse = {
    success: boolean;
    message?: string;
};

export const approveMembershipRequestAction = async (
    requestId: string,
    circle: Circle,
    page: Page,
): Promise<UpdateMembershipRequestResponse> => {
    try {
        const userDid = await getAuthenticatedUserDid();

        // Check if the user is authorized to approve membership requests
        const authorized = await isAuthorized(userDid, circle._id ?? "", features.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to manage membership requests" };
        }

        await updateMembershipRequestStatus(requestId, "approved");

        // Here you would also add the user to the circle as a member
        // This part depends on your specific implementation

        // Clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to approve membership request. " + error?.toString() };
    }
};

export const rejectMembershipRequestAction = async (
    requestId: string,
    circle: Circle,
    page: Page,
): Promise<UpdateMembershipRequestResponse> => {
    try {
        const userDid = await getAuthenticatedUserDid();

        // Check if the user is authorized to reject membership requests
        const authorized = await isAuthorized(userDid, circle._id ?? "", features.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to manage membership requests" };
        }

        await updateMembershipRequestStatus(requestId, "rejected");

        // Clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to reject membership request. " + error?.toString() };
    }
};

export const reconsiderRejectedRequestAction = async (
    requestId: string,
    circle: Circle,
    page: Page,
): Promise<UpdateMembershipRequestResponse> => {
    try {
        const userDid = await getAuthenticatedUserDid();

        // Check if the user is authorized to reconsider rejected requests
        const authorized = await isAuthorized(userDid, circle._id ?? "", features.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to reconsider rejected requests" };
        }

        // Here you would change the status back to "pending"
        // This might involve creating a new function in your data layer
        // For now, we'll reuse the updateMembershipRequestStatus function
        await updateMembershipRequestStatus(requestId, "pending");

        // Clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to reconsider rejected request. " + error?.toString() };
    }
};

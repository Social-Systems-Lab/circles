"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCirclePath } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { addMember } from "@/lib/data/member";
import {
    getAllMembershipRequests,
    getMembershipRequest,
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

        // get member request
        const request = await getMembershipRequest(requestId);

        // add member
        await addMember(request.userDid, circle._id ?? "", ["members"]);

        // clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        // update status of request
        await updateMembershipRequestStatus(request.userDid, circle._id!, "approved");

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

        // get member request
        const request = await getMembershipRequest(requestId);

        // Clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        // update status of request
        await updateMembershipRequestStatus(request.userDid, circle._id!, "rejected");

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to reject membership request. " + error?.toString() };
    }
};
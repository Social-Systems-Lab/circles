"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCirclePath } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { notifyNewMember } from "@/lib/data/matrix";
import { addMember } from "@/lib/data/member";
import {
    getAllMembershipRequests,
    getMembershipRequest,
    updatePendingMembershipRequestStatus,
} from "@/lib/data/membership-requests";
import { Circle, MembershipRequest } from "@/models/models";
import { revalidatePath } from "next/cache";

type MembershipRequestsResponse = {
    success: boolean;
    message?: string;
    pendingRequests?: MembershipRequest[];
    rejectedRequests?: MembershipRequest[];
};

export const getAllMembershipRequestsAction = async (circleId: string): Promise<MembershipRequestsResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view follow requests" };
    }

    try {
        if (!circleId) {
            return { success: false, message: "Invalid circle ID" };
        }

        // check if the user is authorized to view membership requests
        const authorized = await isAuthorized(userDid, circleId, features.general.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to view follow requests" };
        }

        const { pendingRequests, rejectedRequests } = await getAllMembershipRequests(circleId);
        return { success: true, pendingRequests, rejectedRequests };
    } catch (error) {
        return { success: false, message: "Failed to fetch follow requests. " + error?.toString() };
    }
};

type UpdateMembershipRequestResponse = {
    success: boolean;
    message?: string;
};

export const approveMembershipRequestAction = async (
    requestId: string,
    circle: Circle,
): Promise<UpdateMembershipRequestResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to approve membership requests" };
    }

    try {
        // Check if the user is authorized to approve membership requests
        const authorized = await isAuthorized(userDid, circle._id ?? "", features.general.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to manage membership requests" };
        }

        // get member request
        const request = await getMembershipRequest(requestId);

        // add member
        await addMember(request.userDid, circle._id ?? "", ["members"], request.questionnaireAnswers);

        // notify members
        await notifyNewMember(request.userDid, circle);

        // clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}`);

        // update status of request
        await updatePendingMembershipRequestStatus(request._id!, "approved");

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to approve membership request. " + error?.toString() };
    }
};

export const rejectMembershipRequestAction = async (
    requestId: string,
    circle: Circle,
): Promise<UpdateMembershipRequestResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to reject membership requests" };
    }

    try {
        // Check if the user is authorized to reject membership requests
        const authorized = await isAuthorized(userDid, circle._id ?? "", features.general.manage_membership_requests);
        if (!authorized) {
            return { success: false, message: "You are not authorized to manage membership requests" };
        }

        // get member request
        const request = await getMembershipRequest(requestId);

        // Clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}`);

        // update status of request
        await updatePendingMembershipRequestStatus(request._id!, "rejected");

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to reject membership request. " + error?.toString() };
    }
};

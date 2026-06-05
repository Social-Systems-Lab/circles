import { DETACH_ADMIN_CHANGE_BLOCK_MESSAGE, getPendingDetachCircleRequest } from "@/lib/data/circle-detach";
import { db } from "@/lib/data/db";
import { countAdmins, getMember, updateMemberUserGroups } from "@/lib/data/member";
import { AdminRoleRemovalRequest } from "@/models/models";
import { ObjectId } from "mongodb";

export const ADMIN_ROLE_REMOVAL_REQUEST_PENDING_STATUS = "pending" as const;

const adminRoleRemovalRequestsCollection = () =>
    db.collection<AdminRoleRemovalRequest>("adminRoleRemovalRequests");

const getRequiredPendingRequest = async (requestId: string): Promise<AdminRoleRemovalRequest> => {
    const request = await adminRoleRemovalRequestsCollection().findOne({
        _id: new ObjectId(requestId),
        status: ADMIN_ROLE_REMOVAL_REQUEST_PENDING_STATUS,
    });
    if (!request) {
        throw new Error("Admin removal request not found");
    }

    return request;
};

export async function getPendingAdminRoleRemovalRequest(
    circleId: string,
    targetUserDid: string,
): Promise<AdminRoleRemovalRequest | null> {
    return await adminRoleRemovalRequestsCollection()
        .find({
            circleId,
            targetUserDid,
            status: ADMIN_ROLE_REMOVAL_REQUEST_PENDING_STATUS,
        })
        .sort({ createdAt: -1, _id: -1 })
        .limit(1)
        .next();
}

export async function createAdminRoleRemovalRequest(params: {
    circleId: string;
    targetUserDid: string;
    requestedByDid: string;
}): Promise<{ request: AdminRoleRemovalRequest; created: boolean }> {
    const requesterMember = await getMember(params.requestedByDid, params.circleId);
    if (!requesterMember?.userGroups?.includes("admins")) {
        throw new Error("Only circle admins can request admin-role removal");
    }

    const targetMember = await getMember(params.targetUserDid, params.circleId);
    if (!targetMember?.userGroups?.includes("admins")) {
        throw new Error("Target member is not currently an admin");
    }

    const pendingDetachRequest = await getPendingDetachCircleRequest(params.circleId);
    if (pendingDetachRequest) {
        throw new Error(DETACH_ADMIN_CHANGE_BLOCK_MESSAGE);
    }

    const adminCount = await countAdmins(params.circleId);
    if (adminCount <= 1) {
        throw new Error("Cannot remove the last admin.");
    }

    const existingRequest = await getPendingAdminRoleRemovalRequest(params.circleId, params.targetUserDid);
    if (existingRequest) {
        return { request: existingRequest, created: false };
    }

    const now = new Date();
    const request: AdminRoleRemovalRequest = {
        _id: new ObjectId(),
        circleId: params.circleId,
        targetUserDid: params.targetUserDid,
        requestedByDid: params.requestedByDid,
        status: ADMIN_ROLE_REMOVAL_REQUEST_PENDING_STATUS,
        createdAt: now,
        updatedAt: now,
    };

    await adminRoleRemovalRequestsCollection().insertOne(request);

    return { request, created: true };
}

export async function approveAdminRoleRemovalRequest(params: {
    requestId: string;
    targetUserDid: string;
}): Promise<AdminRoleRemovalRequest> {
    const request = await getRequiredPendingRequest(params.requestId);
    if (request.targetUserDid !== params.targetUserDid) {
        throw new Error("Only the target admin can approve this request");
    }

    const pendingDetachRequest = await getPendingDetachCircleRequest(request.circleId);
    if (pendingDetachRequest) {
        throw new Error(DETACH_ADMIN_CHANGE_BLOCK_MESSAGE);
    }

    const targetMember = await getMember(request.targetUserDid, request.circleId);
    if (!targetMember) {
        throw new Error("Target member not found");
    }
    if (!targetMember.userGroups?.includes("admins")) {
        throw new Error("Target member is no longer an admin");
    }

    const adminCount = await countAdmins(request.circleId);
    if (adminCount <= 1) {
        throw new Error("Cannot remove the last admin.");
    }

    const newGroups = (targetMember.userGroups ?? []).filter((group) => group !== "admins");
    await updateMemberUserGroups(request.targetUserDid, request.circleId, newGroups);

    const now = new Date();
    await adminRoleRemovalRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                status: "approved",
                updatedAt: now,
                decidedAt: now,
            },
        },
    );

    return {
        ...request,
        status: "approved",
        updatedAt: now,
        decidedAt: now,
    };
}

export async function declineAdminRoleRemovalRequest(params: {
    requestId: string;
    targetUserDid: string;
}): Promise<AdminRoleRemovalRequest> {
    const request = await getRequiredPendingRequest(params.requestId);
    if (request.targetUserDid !== params.targetUserDid) {
        throw new Error("Only the target admin can decline this request");
    }

    const now = new Date();
    await adminRoleRemovalRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                status: "declined",
                updatedAt: now,
                decidedAt: now,
            },
        },
    );

    return {
        ...request,
        status: "declined",
        updatedAt: now,
        decidedAt: now,
    };
}

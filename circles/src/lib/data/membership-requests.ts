import { MembershipRequest } from "@/models/models";
import { MembershipRequests } from "./db";
import { ObjectId } from "mongodb";

export const getAllMembershipRequests = async (
    circleId: string,
): Promise<{
    pendingRequests: MembershipRequest[];
    rejectedRequests: MembershipRequest[];
}> => {
    if (!circleId) return { pendingRequests: [], rejectedRequests: [] };

    let objectId;
    try {
        objectId = new ObjectId(circleId);
    } catch (error) {
        console.error("Invalid circleId:", circleId);
        return { pendingRequests: [], rejectedRequests: [] };
    }

    const requests = await MembershipRequests.aggregate([
        { $match: { circleId: objectId.toString() } },
        {
            $lookup: {
                from: "circles",
                localField: "userDid",
                foreignField: "did",
                as: "userDetails",
            },
        },
        { $unwind: "$userDetails" },
        {
            $project: {
                _id: { $toString: "$_id" },
                userDid: 1,
                circleId: 1,
                status: 1,
                requestedAt: 1,
                rejectedAt: 1,
                questionnaireAnswers: 1,
                approvedAt: 1,
                name: "$userDetails.name",
                email: "$userDetails.email",
                picture: "$userDetails.picture",
            },
        },
        { $sort: { requestedAt: -1 } }, // sort by most recent first
    ]).toArray();

    const pendingRequests = requests.filter((r) => r.status === "pending") as MembershipRequest[];
    const rejectedRequests = requests.filter((r) => r.status === "rejected") as MembershipRequest[];

    return { pendingRequests, rejectedRequests };
};

export const getUserPendingMembershipRequests = async (userDid: string): Promise<MembershipRequest[]> => {
    if (!userDid) return [];

    const requests = await MembershipRequests.aggregate([
        { $match: { userDid: userDid } },
        {
            $lookup: {
                from: "circles",
                localField: "userDid",
                foreignField: "did",
                as: "userDetails",
            },
        },
        { $unwind: "$userDetails" },
        {
            $project: {
                _id: { $toString: "$_id" },
                userDid: 1,
                circleId: 1,
                status: 1,
                requestedAt: 1,
                rejectedAt: 1,
                name: "$userDetails.name",
                email: "$userDetails.email",
                picture: "$userDetails.picture",
            },
        },
    ]).toArray();

    const pendingRequests = requests.filter((r) => r.status === "pending") as MembershipRequest[];
    return pendingRequests;
};

export const getMembershipRequest = async (requestId: string): Promise<MembershipRequest> => {
    const request = await MembershipRequests.findOne({ _id: new ObjectId(requestId) });
    if (!request) {
        throw new Error("Membership request not found");
    }

    return request as MembershipRequest;
};

export const createPendingMembershipRequest = async (
    userDid: string,
    circleId: string,
    answers?: Record<string, string>,
): Promise<MembershipRequest> => {
    const existingRequest = await MembershipRequests.findOne({ userDid, circleId, status: "pending" });
    if (existingRequest) {
        throw new Error("A pending request already exists for this user and circle");
    }

    const request: MembershipRequest = {
        userDid,
        circleId,
        status: "pending",
        requestedAt: new Date(),
        questionnaireAnswers: answers,
    };

    await MembershipRequests.insertOne(request);
    return request;
};

export const deletePendingMembershipRequest = async (userDid: string, circleId: string): Promise<boolean> => {
    const result = await MembershipRequests.deleteOne({ userDid, circleId, status: "pending" });
    if (result.deletedCount === 0) {
        throw new Error("No pending request found for this user and circle");
    }
    return true;
};

export const updatePendingMembershipRequestStatus = async (
    requestId: string,
    newStatus: "approved" | "rejected",
): Promise<MembershipRequest> => {
    const request = await MembershipRequests.findOne({ _id: new ObjectId(requestId), status: "pending" });
    if (!request) {
        throw new Error("Pending membership request not found");
    }

    const update: Partial<MembershipRequest> = {
        status: newStatus,
    };

    if (newStatus === "rejected") {
        update.rejectedAt = new Date();
    } else {
        update.approvedAt = new Date();
    }

    await MembershipRequests.updateOne({ _id: new ObjectId(requestId) }, { $set: update });

    return { ...request, ...update } as MembershipRequest;
};

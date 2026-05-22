import { getCircleById } from "@/lib/data/circle";
import { db, Circles, Members } from "@/lib/data/db";
import { Circle, DetachCircleRequest } from "@/models/models";
import { ObjectId } from "mongodb";

export const DETACH_REQUEST_PENDING_STATUS = "pending" as const;
export const DETACH_ADMIN_CHANGE_BLOCK_MESSAGE =
    "Admin changes are locked while a detach request is pending for this circle.";

const detachCircleRequestsCollection = () => db.collection<DetachCircleRequest>("detachCircleRequests");

const getResolvedCircleLevel = (circle?: Partial<Circle> | null): "profile_child" | "top_level" =>
    circle?.circleLevel ?? (circle?.parentCircleId ? "profile_child" : "top_level");

const getAdminDidsForCircle = async (circleId: string): Promise<string[]> => {
    const admins = await Members.find({ circleId, userGroups: "admins" }, { projection: { userDid: 1 } }).toArray();
    return Array.from(new Set(admins.map((admin) => admin.userDid).filter(Boolean))).sort();
};

const getRequiredPendingRequest = async (requestId: string): Promise<DetachCircleRequest> => {
    const request = await detachCircleRequestsCollection().findOne({
        _id: new ObjectId(requestId),
        status: DETACH_REQUEST_PENDING_STATUS,
    });
    if (!request) {
        throw new Error("Detach request not found");
    }

    return request;
};

const getDetachableCircle = async (circleId: string): Promise<Circle> => {
    const circle = await getCircleById(circleId);
    if (!circle) {
        throw new Error("Circle not found");
    }

    if (circle.circleType === "user") {
        throw new Error("User profiles cannot be detached");
    }

    if (!circle.parentCircleId || getResolvedCircleLevel(circle) !== "profile_child") {
        throw new Error("Only child circles with a parent can be detached");
    }

    return circle;
};

const performDetachCircle = async (circleId: string, parentCircleId: string): Promise<void> => {
    const result = await Circles.updateOne(
        { _id: new ObjectId(circleId), parentCircleId },
        {
            $set: { circleLevel: "top_level" },
            $unset: { parentCircleId: "" },
        },
    );

    if (result.matchedCount === 0) {
        throw new Error("Circle structure changed before detach could complete");
    }
};

export async function getPendingDetachCircleRequest(circleId: string): Promise<DetachCircleRequest | null> {
    return await detachCircleRequestsCollection()
        .find({
            circleId,
            status: DETACH_REQUEST_PENDING_STATUS,
        })
        .sort({ createdAt: -1, _id: -1 })
        .limit(1)
        .next();
}

export async function createDetachCircleRequest(params: { circleId: string; requestedByDid: string }): Promise<{
    status: "detached" | "pending";
    circle: Circle;
    parentCircle: Circle | null;
    request?: DetachCircleRequest;
}> {
    const circle = await getDetachableCircle(params.circleId);
    const pendingRequest = await getPendingDetachCircleRequest(params.circleId);
    if (pendingRequest) {
        throw new Error("A detach request is already pending for this circle");
    }

    const adminDids = await getAdminDidsForCircle(params.circleId);
    if (!adminDids.includes(params.requestedByDid)) {
        throw new Error("Only circle admins can detach this circle");
    }

    if (adminDids.length < 1) {
        throw new Error("This circle must have at least one admin before detaching");
    }

    const parentCircleId = circle.parentCircleId;
    if (!parentCircleId) {
        throw new Error("Only child circles with a parent can be detached");
    }
    const parentCircle = await getCircleById(parentCircleId);

    if (adminDids.length === 1) {
        await performDetachCircle(params.circleId, parentCircleId);
        return { status: "detached", circle, parentCircle };
    }

    const now = new Date();
    const request: DetachCircleRequest = {
        _id: new ObjectId(),
        circleId: params.circleId,
        parentCircleId,
        requestedByDid: params.requestedByDid,
        requiredAdminDids: adminDids,
        approvedByDids: [params.requestedByDid],
        status: DETACH_REQUEST_PENDING_STATUS,
        createdAt: now,
        updatedAt: now,
    };

    await detachCircleRequestsCollection().insertOne(request);

    return {
        status: "pending",
        circle,
        parentCircle,
        request,
    };
}

export async function approveDetachCircleRequest(params: { requestId: string; adminDid: string }): Promise<{
    status: "pending" | "approved";
    circle: Circle;
    parentCircle: Circle | null;
    request: DetachCircleRequest;
}> {
    const request = await getRequiredPendingRequest(params.requestId);
    if (!request.requiredAdminDids.includes(params.adminDid)) {
        throw new Error("Only the required circle admins can approve this request");
    }

    const circle = await getDetachableCircle(request.circleId);
    if (circle.parentCircleId !== request.parentCircleId) {
        throw new Error("Circle structure changed before this request could be approved");
    }

    const parentCircle = request.parentCircleId ? await getCircleById(request.parentCircleId) : null;
    const now = new Date();
    const approvedByDids = request.approvedByDids.includes(params.adminDid)
        ? request.approvedByDids
        : [...request.approvedByDids, params.adminDid];
    const isFullyApproved = request.requiredAdminDids.every((did) => approvedByDids.includes(did));

    if (!isFullyApproved) {
        await detachCircleRequestsCollection().updateOne(
            { _id: request._id },
            {
                $set: {
                    approvedByDids,
                    updatedAt: now,
                },
            },
        );
    } else {
        await performDetachCircle(request.circleId, request.parentCircleId);
        await detachCircleRequestsCollection().updateOne(
            { _id: request._id },
            {
                $set: {
                    approvedByDids,
                    updatedAt: now,
                    status: "approved",
                    decidedAt: now,
                },
            },
        );
    }

    return {
        status: isFullyApproved ? "approved" : "pending",
        circle,
        parentCircle,
        request: {
            ...request,
            approvedByDids,
            updatedAt: now,
            ...(isFullyApproved ? { status: "approved", decidedAt: now } : {}),
        },
    };
}

export async function declineDetachCircleRequest(params: { requestId: string; adminDid: string }): Promise<{
    circle: Circle;
    parentCircle: Circle | null;
    request: DetachCircleRequest;
}> {
    const request = await getRequiredPendingRequest(params.requestId);
    if (!request.requiredAdminDids.includes(params.adminDid)) {
        throw new Error("Only the required circle admins can decline this request");
    }

    const circle = await getCircleById(request.circleId);
    if (!circle) {
        throw new Error("Circle not found");
    }

    const parentCircle = request.parentCircleId ? await getCircleById(request.parentCircleId) : null;
    const now = new Date();

    await detachCircleRequestsCollection().updateOne(
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
        circle,
        parentCircle,
        request: {
            ...request,
            status: "declined",
            updatedAt: now,
            decidedAt: now,
        },
    };
}

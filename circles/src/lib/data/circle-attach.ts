import { getCircleById } from "@/lib/data/circle";
import { getPendingDetachCircleRequest } from "@/lib/data/circle-detach";
import { Circles, Members, db } from "@/lib/data/db";
import { AttachCircleRequest, Circle } from "@/models/models";
import { ObjectId } from "mongodb";

export const ATTACH_REQUEST_PENDING_STATUS = "pending" as const;

const attachCircleRequestsCollection = () => db.collection<AttachCircleRequest>("attachCircleRequests");

const getResolvedCircleLevel = (circle?: Partial<Circle> | null): "profile_child" | "top_level" =>
    circle?.circleLevel ?? (circle?.parentCircleId ? "profile_child" : "top_level");

const getAdminDidsForCircle = async (circleId: string): Promise<string[]> => {
    const admins = await Members.find({ circleId, userGroups: "admins" }, { projection: { userDid: 1 } }).toArray();
    return Array.from(new Set(admins.map((admin) => admin.userDid).filter(Boolean))).sort();
};

const getRequiredPendingRequest = async (requestId: string): Promise<AttachCircleRequest> => {
    const request = await attachCircleRequestsCollection().findOne({
        _id: new ObjectId(requestId),
        status: ATTACH_REQUEST_PENDING_STATUS,
    });
    if (!request) {
        throw new Error("Move request not found");
    }

    return request;
};

const getAttachableCircle = async (circleId: string): Promise<Circle> => {
    const circle = await getCircleById(circleId);
    if (!circle) {
        throw new Error("Circle not found");
    }

    if (circle.circleType === "user") {
        throw new Error("User profiles cannot change parent circles");
    }

    return circle;
};

const getChildCircleIds = async (parentCircleIds: string[]): Promise<string[]> => {
    if (!parentCircleIds.length) {
        return [];
    }

    const children = await Circles.find(
        { parentCircleId: { $in: parentCircleIds } },
        { projection: { _id: 1 } },
    ).toArray();

    return children
        .map((child) => child._id?.toString?.())
        .filter((childId): childId is string => Boolean(childId));
};

const assertNoHierarchyCycle = async (circleId: string, targetParentCircleId: string): Promise<void> => {
    if (circleId === targetParentCircleId) {
        throw new Error("A circle cannot be its own parent");
    }

    const queue = [circleId];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const nextParents = queue.splice(0, queue.length).filter((id) => !visited.has(id));
        if (!nextParents.length) {
            continue;
        }

        nextParents.forEach((id) => visited.add(id));
        const childIds = await getChildCircleIds(nextParents);

        if (childIds.includes(targetParentCircleId)) {
            throw new Error("Target parent cannot be inside this circle's descendant tree");
        }

        queue.push(...childIds.filter((childId) => !visited.has(childId)));
    }
};

const performAttachCircle = async (circleId: string, fromParentCircleId: string | null | undefined, toParentCircleId: string) => {
    const currentParentCircleId = fromParentCircleId ?? null;
    const match: Record<string, unknown> = { _id: new ObjectId(circleId) };

    if (currentParentCircleId) {
        match.parentCircleId = currentParentCircleId;
    } else {
        match.$or = [{ parentCircleId: { $exists: false } }, { parentCircleId: null }];
    }

    const result = await Circles.updateOne(match, {
        $set: {
            parentCircleId: toParentCircleId,
            circleLevel: "profile_child",
        },
    });

    if (result.matchedCount === 0) {
        throw new Error("Circle structure changed before move could complete");
    }
};

export async function getPendingAttachCircleRequest(circleId: string): Promise<AttachCircleRequest | null> {
    return await attachCircleRequestsCollection()
        .find({
            circleId,
            status: ATTACH_REQUEST_PENDING_STATUS,
        })
        .sort({ createdAt: -1, _id: -1 })
        .limit(1)
        .next();
}

export async function getPendingIncomingAttachCircleRequests(targetParentCircleId: string): Promise<AttachCircleRequest[]> {
    return await attachCircleRequestsCollection()
        .find({
            toParentCircleId: targetParentCircleId,
            status: ATTACH_REQUEST_PENDING_STATUS,
        })
        .sort({ createdAt: -1, _id: -1 })
        .toArray();
}

export async function createAttachCircleRequest(params: {
    circleId: string;
    targetParentCircleHandle: string;
    requestedByDid: string;
}): Promise<{
    circle: Circle;
    fromParentCircle: Circle | null;
    toParentCircle: Circle;
    request: AttachCircleRequest;
}> {
    const circle = await getAttachableCircle(params.circleId);
    const pendingRequest = await getPendingAttachCircleRequest(params.circleId);
    if (pendingRequest) {
        throw new Error("A move request is already pending for this circle");
    }
    const pendingDetachRequest = await getPendingDetachCircleRequest(params.circleId);
    if (pendingDetachRequest) {
        throw new Error("A detach request is already pending for this circle");
    }

    const adminDids = await getAdminDidsForCircle(params.circleId);
    if (!adminDids.includes(params.requestedByDid)) {
        throw new Error("Only circle admins can move this circle");
    }

    const targetHandle = params.targetParentCircleHandle.trim();
    if (!targetHandle) {
        throw new Error("Enter the target parent circle handle");
    }

    const targetParentCircle = await Circles.findOne({ handle: targetHandle });
    if (!targetParentCircle?._id) {
        throw new Error("Target parent circle not found");
    }

    const toParentCircleId = targetParentCircle._id.toString();
    if (toParentCircleId === params.circleId) {
        throw new Error("A circle cannot be its own parent");
    }

    if (circle.parentCircleId === toParentCircleId) {
        throw new Error("This circle is already attached to that parent");
    }

    const targetParentAdminDids = await getAdminDidsForCircle(toParentCircleId);
    if (targetParentAdminDids.length < 1) {
        throw new Error("Target parent circle must have at least one admin");
    }

    await assertNoHierarchyCycle(params.circleId, toParentCircleId);

    const fromParentCircleId = circle.parentCircleId ?? null;
    const fromParentCircle = fromParentCircleId ? await getCircleById(fromParentCircleId) : null;
    const now = new Date();
    const request: AttachCircleRequest = {
        _id: new ObjectId(),
        circleId: params.circleId,
        fromParentCircleId,
        toParentCircleId,
        requestedByDid: params.requestedByDid,
        status: ATTACH_REQUEST_PENDING_STATUS,
        createdAt: now,
        updatedAt: now,
    };

    await attachCircleRequestsCollection().insertOne(request);

    return {
        circle,
        fromParentCircle,
        toParentCircle: {
            ...targetParentCircle,
            _id: toParentCircleId,
            circleLevel: getResolvedCircleLevel(targetParentCircle),
        } as Circle,
        request,
    };
}

export async function approveAttachCircleRequest(params: { requestId: string; adminDid: string }): Promise<{
    circle: Circle;
    fromParentCircle: Circle | null;
    toParentCircle: Circle;
    request: AttachCircleRequest;
}> {
    const request = await getRequiredPendingRequest(params.requestId);
    const approverAdminDids = await getAdminDidsForCircle(request.toParentCircleId);
    if (!approverAdminDids.includes(params.adminDid)) {
        throw new Error("Only target parent circle admins can approve this request");
    }

    const circle = await getAttachableCircle(request.circleId);
    const toParentCircle = await getCircleById(request.toParentCircleId);
    if (!toParentCircle) {
        throw new Error("Target parent circle not found");
    }

    await assertNoHierarchyCycle(request.circleId, request.toParentCircleId);
    await performAttachCircle(request.circleId, request.fromParentCircleId, request.toParentCircleId);

    const fromParentCircle = request.fromParentCircleId ? await getCircleById(request.fromParentCircleId) : null;
    const now = new Date();

    await attachCircleRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                approvedByDid: params.adminDid,
                status: "approved",
                updatedAt: now,
                decidedAt: now,
            },
        },
    );

    return {
        circle,
        fromParentCircle,
        toParentCircle,
        request: {
            ...request,
            approvedByDid: params.adminDid,
            status: "approved",
            updatedAt: now,
            decidedAt: now,
        },
    };
}

export async function declineAttachCircleRequest(params: { requestId: string; adminDid: string }): Promise<{
    circle: Circle;
    fromParentCircle: Circle | null;
    toParentCircle: Circle;
    request: AttachCircleRequest;
}> {
    const request = await getRequiredPendingRequest(params.requestId);
    const approverAdminDids = await getAdminDidsForCircle(request.toParentCircleId);
    if (!approverAdminDids.includes(params.adminDid)) {
        throw new Error("Only target parent circle admins can decline this request");
    }

    const circle = await getAttachableCircle(request.circleId);
    const toParentCircle = await getCircleById(request.toParentCircleId);
    if (!toParentCircle) {
        throw new Error("Target parent circle not found");
    }

    const fromParentCircle = request.fromParentCircleId ? await getCircleById(request.fromParentCircleId) : null;
    const now = new Date();

    await attachCircleRequestsCollection().updateOne(
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
        fromParentCircle,
        toParentCircle,
        request: {
            ...request,
            status: "declined",
            updatedAt: now,
            decidedAt: now,
        },
    };
}

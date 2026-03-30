import { buildVerifiedUserSet } from "@/lib/auth/verification";
import { Circles, db } from "@/lib/data/db";
import { sendNotifications } from "@/lib/data/notifications";
import { saveFile } from "@/lib/data/storage";
import {
    Circle,
    FileInfo,
    UserPrivate,
    VerificationMessage,
    VerificationRequest,
    VerificationRequestStatus,
} from "@/models/models";
import { ObjectId } from "mongodb";
import { getUserPrivate } from "./user";

export const ACTIVE_VERIFICATION_REQUEST_STATUSES = [
    "pending",
    "submitted",
    "awaiting_admin",
    "awaiting_applicant",
] as const;

export type ActiveVerificationRequestStatus = (typeof ACTIVE_VERIFICATION_REQUEST_STATUSES)[number];

const verificationRequestsCollection = () => db.collection<VerificationRequest>("verifications");
const verificationMessagesCollection = () => db.collection<VerificationMessage>("verificationMessages");

export const normalizeVerificationRequestStatus = (
    status?: VerificationRequestStatus,
): Exclude<VerificationRequestStatus, "pending"> => {
    if (!status || status === "pending") {
        return "submitted";
    }

    return status;
};

export const getVerificationRequestSubmittedAt = (request: VerificationRequest): Date =>
    request.submittedAt ?? request.requestedAt ?? request.updatedAt ?? request.reviewedAt ?? new Date();

export const getVerificationRequestUpdatedAt = (request: VerificationRequest): Date =>
    request.updatedAt ?? request.latestMessageAt ?? getVerificationRequestSubmittedAt(request);

export const isVerificationRequestActive = (request: VerificationRequest): boolean =>
    ACTIVE_VERIFICATION_REQUEST_STATUSES.includes(
        (request.status ?? "submitted") as ActiveVerificationRequestStatus,
    );

export const canApplicantReplyToVerificationRequest = (request: VerificationRequest): boolean => {
    const status = normalizeVerificationRequestStatus(request.status);
    return status !== "approved" && status !== "rejected";
};

const serializeFileInfo = (file: FileInfo): FileInfo => ({
    url: file.url,
    fileName: file.fileName,
    originalName: file.originalName,
});

export const serializeVerificationRequest = (request: VerificationRequest) => ({
    id: request._id?.toString?.() ?? "",
    userDid: request.userDid,
    status: normalizeVerificationRequestStatus(request.status),
    submittedAt: getVerificationRequestSubmittedAt(request).toISOString(),
    updatedAt: getVerificationRequestUpdatedAt(request).toISOString(),
    latestMessageAt: request.latestMessageAt?.toISOString() ?? null,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    reviewedBy: request.reviewedBy ?? null,
    decisionReason: request.decisionReason ?? null,
});

export const serializeVerificationMessage = (message: VerificationMessage, senderName: string) => ({
    id: message._id?.toString?.() ?? "",
    requestId: message.requestId,
    senderDid: message.senderDid,
    senderRole: message.senderRole,
    senderName,
    body: message.body,
    attachments: (message.attachments ?? []).map(serializeFileInfo),
    createdAt: message.createdAt.toISOString(),
});

export async function getVerificationAdmins(excludeDid?: string): Promise<UserPrivate[]> {
    const query: Record<string, unknown> = { isAdmin: true, circleType: "user" };
    if (excludeDid) {
        query.did = { $ne: excludeDid };
    }

    const admins = await db.collection<Circle>("circles").find(query).toArray();
    return (await Promise.all(admins.map((admin) => getUserPrivate(admin.did!)))).filter(
        (admin): admin is UserPrivate => Boolean(admin?.did),
    );
}

export async function getLatestVerificationRequestForUser(userDid: string): Promise<VerificationRequest | null> {
    return await verificationRequestsCollection()
        .find({ userDid })
        .sort({ submittedAt: -1, requestedAt: -1, updatedAt: -1, reviewedAt: -1, _id: -1 })
        .limit(1)
        .next();
}

export async function getActiveVerificationRequestForUser(userDid: string): Promise<VerificationRequest | null> {
    return await verificationRequestsCollection()
        .find({
            userDid,
            status: { $in: [...ACTIVE_VERIFICATION_REQUEST_STATUSES] },
        })
        .sort({ submittedAt: -1, requestedAt: -1, updatedAt: -1, _id: -1 })
        .limit(1)
        .next();
}

export async function getVerificationMessagesForRequest(requestId: string): Promise<VerificationMessage[]> {
    return await verificationMessagesCollection()
        .find({ requestId })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
}

export async function createVerificationRequest(userDid: string): Promise<VerificationRequest> {
    const existingRequest = await getActiveVerificationRequestForUser(userDid);
    if (existingRequest) {
        return existingRequest;
    }

    const now = new Date();
    const request: VerificationRequest = {
        _id: new ObjectId(),
        userDid,
        status: "submitted",
        requestedAt: now,
        submittedAt: now,
        updatedAt: now,
        latestMessageAt: now,
    };

    await verificationRequestsCollection().insertOne(request);
    return request;
}

export async function getVerificationRequestById(requestId: string): Promise<VerificationRequest | null> {
    if (!ObjectId.isValid(requestId)) {
        return null;
    }

    return await verificationRequestsCollection().findOne({ _id: new ObjectId(requestId) });
}

const saveVerificationAttachments = async (files: File[], ownerId: string): Promise<FileInfo[]> => {
    const attachments: FileInfo[] = [];

    for (const file of files) {
        if (!(file instanceof File) || file.size === 0) {
            continue;
        }

        const saved = await saveFile(file, "verification-attachment", ownerId, true);
        attachments.push(saved);
    }

    return attachments;
};

export async function addApplicantVerificationMessage(params: {
    requestId: string;
    applicantDid: string;
    body: string;
    files?: File[];
}): Promise<{ request: VerificationRequest; message: VerificationMessage; applicant: UserPrivate }> {
    const request = await getVerificationRequestById(params.requestId);
    if (!request) {
        throw new Error("Verification request not found.");
    }
    if (request.userDid !== params.applicantDid) {
        throw new Error("Unauthorized.");
    }
    if (!canApplicantReplyToVerificationRequest(request)) {
        throw new Error("This verification request is closed.");
    }

    const applicant = await getUserPrivate(params.applicantDid);
    const trimmedBody = params.body.trim();
    const attachments = await saveVerificationAttachments(params.files ?? [], applicant._id as string);
    if (!trimmedBody && attachments.length === 0) {
        throw new Error("Add a message or an attachment.");
    }

    const now = new Date();
    const message: VerificationMessage = {
        _id: new ObjectId(),
        requestId: request._id!.toString(),
        senderDid: applicant.did!,
        senderRole: "applicant",
        body: trimmedBody,
        attachments,
        createdAt: now,
    };

    await verificationMessagesCollection().insertOne(message);
    await verificationRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                status: "awaiting_admin",
                updatedAt: now,
                latestMessageAt: now,
            },
        },
    );

    return {
        request: {
            ...request,
            status: "awaiting_admin",
            updatedAt: now,
            latestMessageAt: now,
        },
        message,
        applicant,
    };
}

export async function addAdminVerificationMessage(params: {
    requestId: string;
    adminDid: string;
    body: string;
}): Promise<{ request: VerificationRequest; message: VerificationMessage; admin: UserPrivate; applicant: UserPrivate }> {
    const request = await getVerificationRequestById(params.requestId);
    if (!request) {
        throw new Error("Verification request not found.");
    }

    const status = normalizeVerificationRequestStatus(request.status);
    if (status === "approved" || status === "rejected") {
        throw new Error("This verification request is closed.");
    }

    const admin = await getUserPrivate(params.adminDid);
    if (!admin.isAdmin) {
        throw new Error("Unauthorized.");
    }

    const trimmedBody = params.body.trim();
    if (!trimmedBody) {
        throw new Error("Clarification message is required.");
    }

    const applicant = await getUserPrivate(request.userDid);
    const now = new Date();
    const message: VerificationMessage = {
        _id: new ObjectId(),
        requestId: request._id!.toString(),
        senderDid: admin.did!,
        senderRole: "admin",
        body: trimmedBody,
        attachments: [],
        createdAt: now,
    };

    await verificationMessagesCollection().insertOne(message);
    await verificationRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                status: "awaiting_applicant",
                updatedAt: now,
                latestMessageAt: now,
            },
        },
    );

    return {
        request: {
            ...request,
            status: "awaiting_applicant",
            updatedAt: now,
            latestMessageAt: now,
        },
        message,
        admin,
        applicant,
    };
}

export async function approveVerificationRequest(params: {
    requestId: string;
    adminDid: string;
}): Promise<{ request: VerificationRequest; applicant: UserPrivate }> {
    const request = await getVerificationRequestById(params.requestId);
    if (!request) {
        throw new Error("Verification request not found.");
    }

    const admin = await getUserPrivate(params.adminDid);
    if (!admin.isAdmin) {
        throw new Error("Unauthorized.");
    }

    const status = normalizeVerificationRequestStatus(request.status);
    if (status === "approved" || status === "rejected") {
        throw new Error("This verification request is already closed.");
    }

    const applicant = await getUserPrivate(request.userDid);
    const now = new Date();

    await Circles.updateOne({ did: request.userDid }, { $set: buildVerifiedUserSet(admin.did!) });
    await verificationRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                status: "approved",
                updatedAt: now,
                reviewedAt: now,
                reviewedBy: admin.did,
            },
        },
    );

    return {
        request: {
            ...request,
            status: "approved",
            updatedAt: now,
            reviewedAt: now,
            reviewedBy: admin.did,
        },
        applicant,
    };
}

export async function rejectVerificationRequest(params: {
    requestId: string;
    adminDid: string;
    reason: string;
}): Promise<{ request: VerificationRequest; applicant: UserPrivate; admin: UserPrivate }> {
    const request = await getVerificationRequestById(params.requestId);
    if (!request) {
        throw new Error("Verification request not found.");
    }

    const admin = await getUserPrivate(params.adminDid);
    if (!admin.isAdmin) {
        throw new Error("Unauthorized.");
    }

    const status = normalizeVerificationRequestStatus(request.status);
    if (status === "approved" || status === "rejected") {
        throw new Error("This verification request is already closed.");
    }

    const reason = params.reason.trim();
    if (!reason) {
        throw new Error("A rejection reason is required.");
    }

    const applicant = await getUserPrivate(request.userDid);
    const now = new Date();

    await verificationRequestsCollection().updateOne(
        { _id: request._id },
        {
            $set: {
                status: "rejected",
                updatedAt: now,
                reviewedAt: now,
                reviewedBy: admin.did,
                decisionReason: reason,
            },
        },
    );

    return {
        request: {
            ...request,
            status: "rejected",
            updatedAt: now,
            reviewedAt: now,
            reviewedBy: admin.did,
            decisionReason: reason,
        },
        applicant,
        admin,
    };
}

export async function listAdminVerificationRequests() {
    const requests = await verificationRequestsCollection()
        .find({
            status: { $in: [...ACTIVE_VERIFICATION_REQUEST_STATUSES] },
        })
        .sort({ latestMessageAt: -1, updatedAt: -1, submittedAt: -1, requestedAt: -1, _id: -1 })
        .toArray();

    const applicants = await Promise.all(
        requests.map(async (request) => {
            const applicant = await getUserPrivate(request.userDid);
            return [request.userDid, applicant] as const;
        }),
    );

    const applicantMap = new Map(applicants);

    return requests.map((request) => {
        const applicant = applicantMap.get(request.userDid);
        return {
            request: serializeVerificationRequest(request),
            applicant: applicant
                ? {
                      did: applicant.did ?? "",
                      handle: applicant.handle ?? "",
                      name: applicant.name ?? "Unknown user",
                      email: applicant.email ?? "",
                      picture: applicant.picture ?? { url: "/images/default-user-picture.png" },
                  }
                : {
                      did: request.userDid,
                      handle: "",
                      name: request.userDid,
                      email: "",
                      picture: { url: "/images/default-user-picture.png" },
                  },
        };
    });
}

export async function getAdminVerificationRequestDetail(requestId: string) {
    const request = await getVerificationRequestById(requestId);
    if (!request) {
        return null;
    }

    const applicant = await getUserPrivate(request.userDid);
    const messages = await getVerificationMessagesForRequest(request._id!.toString());

    const senderNames = new Map<string, string>([
        [applicant.did!, applicant.name ?? "Applicant"],
    ]);

    await Promise.all(
        messages.map(async (message) => {
            if (senderNames.has(message.senderDid)) {
                return;
            }

            try {
                const sender = await getUserPrivate(message.senderDid);
                senderNames.set(message.senderDid, sender.name ?? "Admin");
            } catch {
                senderNames.set(message.senderDid, message.senderRole === "admin" ? "Admin" : "Applicant");
            }
        }),
    );

    return {
        request: serializeVerificationRequest(request),
        applicant: {
            did: applicant.did ?? "",
            handle: applicant.handle ?? "",
            name: applicant.name ?? "Unknown user",
            email: applicant.email ?? "",
            picture: applicant.picture ?? { url: "/images/default-user-picture.png" },
            isVerified: applicant.isVerified === true,
        },
        messages: messages.map((message) =>
            serializeVerificationMessage(message, senderNames.get(message.senderDid) ?? "Unknown user"),
        ),
    };
}

export async function getApplicantVerificationThread(userDid: string) {
    const applicant = await getUserPrivate(userDid);
    const request = await getLatestVerificationRequestForUser(userDid);
    if (!request) {
        return {
            request: null,
            messages: [],
            canReply: false,
            isVerified: applicant.isVerified === true,
        };
    }

    const messages = await getVerificationMessagesForRequest(request._id!.toString());
    const senderNames = new Map<string, string>([[applicant.did!, applicant.name ?? "You"]]);

    await Promise.all(
        messages.map(async (message) => {
            if (senderNames.has(message.senderDid)) {
                return;
            }

            try {
                const sender = await getUserPrivate(message.senderDid);
                senderNames.set(message.senderDid, sender.name ?? "Admin");
            } catch {
                senderNames.set(message.senderDid, message.senderRole === "admin" ? "Admin" : "You");
            }
        }),
    );

    return {
        request: serializeVerificationRequest(request),
        messages: messages.map((message) =>
            serializeVerificationMessage(
                message,
                senderNames.get(message.senderDid) ?? (message.senderRole === "admin" ? "Admin" : "You"),
            ),
        ),
        canReply: canApplicantReplyToVerificationRequest(request),
        isVerified: applicant.isVerified === true,
    };
}

export async function notifyApplicantVerificationClarification(applicant: UserPrivate, admin: UserPrivate): Promise<void> {
    if (!applicant.handle) {
        return;
    }

    await sendNotifications("user_verification_clarification_requested", [applicant], {
        user: admin,
        messageBody: `${admin.name || "An admin"} requested more information for your verification.`,
        url: `/circles/${applicant.handle}/settings/subscription`,
    });
}

export async function notifyAdminsOfApplicantVerificationReply(
    applicant: UserPrivate,
    admins: UserPrivate[],
): Promise<void> {
    if (!admins.length) {
        return;
    }

    await sendNotifications("user_verification_reply_received", admins, {
        user: applicant,
        messageBody: `${applicant.name || "An applicant"} replied in a verification request.`,
        url: "/admin?tab=verification-requests",
    });
}

export async function notifyApplicantOfVerificationApproval(applicant: UserPrivate): Promise<void> {
    if (!applicant.handle) {
        return;
    }

    await sendNotifications("user_verified", [applicant], {
        user: applicant,
        messageBody: "Your account verification request was approved.",
        url: `/circles/${applicant.handle}/settings/subscription`,
    });
}

export async function notifyApplicantOfVerificationRejection(
    applicant: UserPrivate,
    reason: string,
): Promise<void> {
    if (!applicant.handle) {
        return;
    }

    const suffix = reason.trim() ? ` Reason: ${reason.trim()}` : "";
    await sendNotifications("user_verification_rejected", [applicant], {
        user: applicant,
        messageBody: `Your account verification request was rejected.${suffix}`,
        url: `/circles/${applicant.handle}/settings/subscription`,
    });
}

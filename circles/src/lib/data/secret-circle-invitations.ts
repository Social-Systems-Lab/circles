import crypto from "crypto";
import { ObjectId } from "mongodb";
import type { Circle, Member, SecretCircleInvitation } from "@/models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "./constants";
import { Circles, ensureSecretCircleInvitationIndexes, Members, SecretCircleInvitations } from "./db";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { canReadCircle } from "./circle-visibility-policy";
import { reconcileSecretInvitationMembership } from "./secret-invitation-membership";
import { sendNotifications } from "./notifications";
import { resolveKamooniProfileHandle } from "@/lib/profile-reference";

const PRIVATE_INVITE_MESSAGE = "You have received a private Circle invitation.";

type EligibleContext = { circle: Circle; membership: Member };
export type SecretInvitationView =
    | { status: "accepted"; circle: { handle: string } }
    | {
          status: "pending";
          circle: { name?: string; handle?: string; picture?: { url: string } };
          inviter: { name?: string; handle?: string; picture?: { url: string } };
      };
export type PendingSecretCircleInvitation = {
    invitationId: string;
    recipientName: string;
    recipientHandle: string;
    recipientAvatarUrl?: string;
    invitedAt: string;
};

async function getEligibleInviter(inviterDid: string, circleId: string): Promise<EligibleContext | null> {
    if (!ObjectId.isValid(circleId)) return null;
    const [circle, membership] = await Promise.all([
        Circles.findOne({ _id: new ObjectId(circleId) }),
        Members.findOne({ userDid: inviterDid, circleId }),
    ]);
    if (!circle || circle.circleType !== "circle" || circle.visibility !== "secret" || !membership) return null;
    if (!canWriteCircleByLifecycle(circle)) return null;
    if (!(await isAuthorized(inviterDid, circleId, features.general.invite_members))) return null;
    return { circle, membership };
}

async function getValidInvitation(invitationId: string, recipientDid: string) {
    if (!ObjectId.isValid(invitationId)) return null;
    const invitation = await SecretCircleInvitations.findOne({ _id: new ObjectId(invitationId) });
    if (!invitation || invitation.recipientDid !== recipientDid || invitation.status === "revoked") return null;
    const [inviterContext, recipient] = await Promise.all([
        getEligibleInviter(invitation.invitedByDid, invitation.circleId),
        Circles.findOne({ did: invitation.recipientDid, circleType: "user", accountStatus: "active" }),
    ]);
    if (!inviterContext || !recipient) return null;
    return { invitation, circle: inviterContext.circle, recipient };
}

export async function resolveSecretInvitationRecipient(circleId: string, reference: string) {
    const inviterDid = await getAuthenticatedUserDid();
    if (!inviterDid || !(await getEligibleInviter(inviterDid, circleId))) return null;
    const handle = resolveKamooniProfileHandle(reference);
    if (!handle) return null;
    const target = await Circles.findOne(
        { handle, circleType: "user", accountStatus: "active" },
        { projection: { did: 1, name: 1, handle: 1, picture: 1 } },
    );
    if (!target?.did || target.did === inviterDid) return null;
    if (await Members.findOne({ userDid: target.did, circleId })) return null;
    return {
        name: target.name,
        handle: target.handle,
        picture: target.picture ? { url: target.picture.url } : undefined,
    };
}

export async function createSecretCircleInvitation(circleId: string, reference: string) {
    await ensureSecretCircleInvitationIndexes();
    const invitedByDid = await getAuthenticatedUserDid();
    if (!invitedByDid || !(await getEligibleInviter(invitedByDid, circleId))) return { ok: false as const };
    const handle = resolveKamooniProfileHandle(reference);
    if (!handle) return { ok: false as const };
    const recipient = await Circles.findOne({ handle, circleType: "user", accountStatus: "active" });
    if (!recipient?.did || recipient.did === invitedByDid) return { ok: false as const };
    if (await Members.findOne({ userDid: recipient.did, circleId })) return { ok: false as const };
    if (await SecretCircleInvitations.findOne({ circleId, recipientDid: recipient.did, status: "pending" })) {
        return { ok: true as const, alreadyInvited: true as const };
    }

    const now = new Date();
    const invitation: Omit<SecretCircleInvitation, "_id"> = {
        circleId,
        recipientDid: recipient.did,
        invitedByDid,
        status: "pending",
        createdAt: now,
        updatedAt: now,
    };
    let invitationId: string;
    try {
        const result = await SecretCircleInvitations.insertOne(invitation as SecretCircleInvitation);
        invitationId = result.insertedId.toString();
    } catch (error: any) {
        if (error?.code === 11000) return { ok: true as const, alreadyInvited: true as const };
        throw error;
    }
    const url = `/secret-invitations/${invitationId}`;
    try {
        await sendNotifications(
            "secret_circle_invitation",
            [{ did: recipient.did }],
            { body: PRIVATE_INVITE_MESSAGE, url, invitationId },
            { idempotencyKey: invitationId },
        );
    } catch (error) {
        await SecretCircleInvitations.deleteOne({
            _id: new ObjectId(invitationId),
            status: "pending",
            processingBy: { $exists: false },
            processingAt: { $exists: false },
            acceptedAt: { $exists: false },
            revokedAt: { $exists: false },
        });
        throw error;
    }
    return { ok: true as const, alreadyInvited: false as const };
}

export async function listPendingSecretCircleInvitations(circleId: string) {
    try {
        const actorDid = await getAuthenticatedUserDid();
        if (!actorDid || !(await getEligibleInviter(actorDid, circleId))) return { ok: false as const };

        const invitations = await SecretCircleInvitations.find({ circleId, status: "pending" }).toArray();
        const pending = await Promise.all(
            invitations.map(async (invitation): Promise<PendingSecretCircleInvitation | null> => {
                const [membership, recipient] = await Promise.all([
                    Members.findOne({ userDid: invitation.recipientDid, circleId }),
                    Circles.findOne(
                        { did: invitation.recipientDid, circleType: "user" },
                        { projection: { name: 1, handle: 1, picture: 1 } },
                    ),
                ]);
                if (membership || !recipient?.handle) return null;
                return {
                    invitationId: invitation._id!.toString(),
                    recipientName: recipient.name || recipient.handle,
                    recipientHandle: recipient.handle,
                    recipientAvatarUrl: recipient.picture?.url,
                    invitedAt: invitation.createdAt.toISOString(),
                };
            }),
        );

        return { ok: true as const, invitations: pending.filter((item) => item !== null) };
    } catch {
        return { ok: false as const };
    }
}

export async function inspectSecretCircleInvitation(invitationId: string): Promise<SecretInvitationView | null> {
    const recipientDid = await getAuthenticatedUserDid();
    if (!recipientDid || !ObjectId.isValid(invitationId)) return null;
    const invitation = await SecretCircleInvitations.findOne({ _id: new ObjectId(invitationId) });
    if (!invitation || invitation.recipientDid !== recipientDid || invitation.status === "revoked") return null;

    if (invitation.status === "accepted") {
        if (!ObjectId.isValid(invitation.circleId)) return null;
        const circle = await Circles.findOne({ _id: new ObjectId(invitation.circleId) });
        if (!circle || circle.circleType !== "circle" || circle.visibility !== "secret" || !circle.handle) return null;
        const membership = await Members.findOne({ userDid: recipientDid, circleId: invitation.circleId });
        if (!membership) return null;
        const readable = await canReadCircle(recipientDid, circle, {
            getMember: async (userDid, circleId) =>
                userDid === recipientDid && circleId === invitation.circleId ? membership : null,
        });
        return readable ? { status: "accepted", circle: { handle: circle.handle } } : null;
    }

    const valid = await getValidInvitation(invitationId, recipientDid);
    if (!valid) return null;
    const inviter = await Circles.findOne(
        { did: valid.invitation.invitedByDid, circleType: "user" },
        { projection: { name: 1, handle: 1, picture: 1 } },
    );
    if (!inviter) return null;
    return {
        status: "pending",
        circle: { name: valid.circle.name, handle: valid.circle.handle, picture: valid.circle.picture },
        inviter: { name: inviter.name, handle: inviter.handle, picture: inviter.picture },
    };
}

export async function acceptSecretCircleInvitation(invitationId: string) {
    await ensureSecretCircleInvitationIndexes();
    const recipientDid = await getAuthenticatedUserDid();
    if (!recipientDid) return { ok: false as const };
    const valid = await getValidInvitation(invitationId, recipientDid);
    if (!valid) return { ok: false as const };
    const existing = await Members.findOne({ userDid: recipientDid, circleId: valid.invitation.circleId });
    if (valid.invitation.status === "accepted")
        return { ok: Boolean(existing), circleHandle: existing ? valid.circle.handle : undefined };

    const processingBy = crypto.randomUUID();
    const claimed = await SecretCircleInvitations.findOneAndUpdate(
        {
            _id: valid.invitation._id,
            status: "pending",
            processingBy: { $exists: false },
        },
        { $set: { processingBy, processingAt: new Date(), updatedAt: new Date() } },
        { returnDocument: "after" },
    );
    if (!claimed) return { ok: false as const };
    try {
        await reconcileSecretInvitationMembership(recipientDid, valid.invitation.circleId);
        const finalized = await SecretCircleInvitations.updateOne(
            { _id: valid.invitation._id, status: "pending", processingBy },
            {
                $set: { status: "accepted", acceptedAt: new Date(), updatedAt: new Date() },
                $unset: { processingBy: "", processingAt: "" },
            },
        );
        if (finalized.matchedCount === 1) return { ok: true as const, circleHandle: valid.circle.handle };

        const [freshInvitation, freshMembership] = await Promise.all([
            SecretCircleInvitations.findOne({ _id: valid.invitation._id }),
            Members.findOne({ userDid: recipientDid, circleId: valid.invitation.circleId }),
        ]);
        if (freshInvitation?.status === "accepted" && freshMembership) {
            return { ok: true as const, circleHandle: valid.circle.handle };
        }
        return { ok: false as const };
    } catch (error) {
        await SecretCircleInvitations.updateOne(
            { _id: valid.invitation._id, status: "pending", processingBy },
            { $unset: { processingBy: "", processingAt: "" }, $set: { updatedAt: new Date() } },
        );
        throw error;
    }
}

export async function revokeSecretCircleInvitation(invitationId: string) {
    await ensureSecretCircleInvitationIndexes();
    const actorDid = await getAuthenticatedUserDid();
    if (!actorDid || !ObjectId.isValid(invitationId)) return { ok: false as const };
    const invitation = await SecretCircleInvitations.findOne({ _id: new ObjectId(invitationId) });
    if (!invitation || !(await getEligibleInviter(actorDid, invitation.circleId))) return { ok: false as const };
    if (invitation.status === "revoked") return { ok: true as const, status: "revoked" as const };
    if (invitation.status !== "pending" || invitation.processingBy) return { ok: false as const };
    const revoked = await SecretCircleInvitations.updateOne(
        { _id: invitation._id, status: "pending", processingBy: { $exists: false } },
        {
            $set: { status: "revoked", revokedAt: new Date(), updatedAt: new Date() },
        },
    );
    if (revoked.matchedCount === 1) return { ok: true as const, status: "revoked" as const };
    const freshInvitation = await SecretCircleInvitations.findOne({ _id: invitation._id });
    return freshInvitation?.status === "revoked"
        ? { ok: true as const, status: "revoked" as const }
        : { ok: false as const };
}

"use server";

import {
    createSecretCircleInvitation as createSecretCircleInvitationData,
    listPendingSecretCircleInvitations as listPendingSecretCircleInvitationsData,
    revokeSecretCircleInvitation as revokeSecretCircleInvitationData,
    resolveSecretInvitationRecipient as resolveSecretInvitationRecipientData,
} from "@/lib/data/secret-circle-invitations";

export async function createSecretCircleInvitation(circleId: string, reference: string) {
    return await createSecretCircleInvitationData(circleId, reference);
}

export async function resolveSecretInvitationRecipient(circleId: string, reference: string) {
    return await resolveSecretInvitationRecipientData(circleId, reference);
}

export async function listPendingSecretCircleInvitations(circleId: string) {
    return await listPendingSecretCircleInvitationsData(circleId);
}

export async function revokeSecretCircleInvitation(invitationId: string) {
    return await revokeSecretCircleInvitationData(invitationId);
}

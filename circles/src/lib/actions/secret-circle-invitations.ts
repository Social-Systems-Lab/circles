"use server";

import { revokeSecretCircleInvitation as revokeSecretCircleInvitationData } from "@/lib/data/secret-circle-invitations";

export async function revokeSecretCircleInvitation(invitationId: string) {
    return await revokeSecretCircleInvitationData(invitationId);
}

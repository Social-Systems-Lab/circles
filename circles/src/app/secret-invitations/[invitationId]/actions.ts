"use server";

import { redirect } from "next/navigation";
import { acceptSecretCircleInvitation } from "@/lib/data/secret-circle-invitations";

export async function acceptSecretInvitationAction(invitationId: string) {
    const result = await acceptSecretCircleInvitation(invitationId);
    if (result.ok && result.circleHandle) redirect(`/circles/${result.circleHandle}`);
    redirect(`/secret-invitations/${invitationId}?result=unavailable`);
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { inspectSecretCircleInvitation } from "@/lib/data/secret-circle-invitations";
import { Button } from "@/components/ui/button";
import { acceptSecretInvitationAction } from "./actions";

export default async function SecretInvitationPage({ params }: { params: Promise<{ invitationId: string }> }) {
    const { invitationId } = await params;
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return (
            <main className="mx-auto max-w-lg px-6 py-16 text-center">
                <h1 className="text-2xl font-semibold">Private Circle invitation</h1>
                <p className="mt-3 text-muted-foreground">Sign in to view this private invitation.</p>
                <Button asChild className="mt-6">
                    <Link href="/login">Sign in</Link>
                </Button>
            </main>
        );
    }

    const invitation = await inspectSecretCircleInvitation(invitationId);
    if (!invitation) {
        return (
            <main className="mx-auto max-w-lg px-6 py-16 text-center">
                <h1 className="text-2xl font-semibold">Private invitation unavailable</h1>
                <p className="mt-3 text-muted-foreground">This invitation is not available for this account.</p>
            </main>
        );
    }
    if (invitation.status === "accepted") redirect(`/circles/${invitation.circle.handle}`);

    return (
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
            <h1 className="text-2xl font-semibold">Invitation to {invitation.circle.name}</h1>
            <p className="mt-3 text-muted-foreground">
                {invitation.inviter.name || `@${invitation.inviter.handle}`} invited you to join this private Circle.
            </p>
            <form action={acceptSecretInvitationAction.bind(null, invitationId)} className="mt-6">
                <Button type="submit">Accept invitation</Button>
            </form>
        </main>
    );
}

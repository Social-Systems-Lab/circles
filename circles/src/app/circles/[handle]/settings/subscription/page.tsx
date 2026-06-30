import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import SubscriptionFormSettings from "./subscription-form-settings";
import { getTelegramChannelViewForUser } from "@/lib/data/external-notification-channels";
import {
    createPlatformMembershipCredentialCard,
    getLinkedVibeIdDid,
    type PlatformMembershipCredentialCardData,
} from "@/lib/vibe-id/membership-credentials";

type SubscriptionProps = {
    params: Promise<{ handle: string }>;
};

export default async function SubscriptionPage(props: SubscriptionProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);
    const userDid = await getAuthenticatedUserDid();
    const user = userDid ? await getUserPrivate(userDid) : null;
    let membershipCredential: PlatformMembershipCredentialCardData | null = null;
    const telegramChannel = userDid ? await getTelegramChannelViewForUser(userDid) : null;

    if (!circle || !user || user.handle !== circle.handle) {
        return <div>Unauthorized</div>;
    }

    const subjectVibeDid = getLinkedVibeIdDid(user);
    if (subjectVibeDid) {
        membershipCredential = createPlatformMembershipCredentialCard({
            user,
            subjectVibeDid,
        });
    }

    return (
        <div className="container py-8">
            <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
                <p className="text-muted-foreground">
                    Manage your verification thread, message reminders, and subscription and supporter options in one place.
                </p>
            </div>
            <div className="mt-8 max-w-5xl">
                <SubscriptionFormSettings
                    user={user}
                    membershipCredential={membershipCredential}
                    telegramChannel={telegramChannel}
                />
            </div>
        </div>
    );
}

import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import SubscriptionFormSettings from "./subscription-form-settings";

type SubscriptionProps = {
    params: Promise<{ handle: string }>;
};

export default async function SubscriptionPage(props: SubscriptionProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);
    const userDid = await getAuthenticatedUserDid();
    const user = userDid ? await getUserPrivate(userDid) : null;

    if (!circle || !user || user.handle !== circle.handle) {
        return <div>Unauthorized</div>;
    }

    return (
        <div className="container py-8">
            <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
                <p className="text-muted-foreground">
                    Manage your verification thread, message reminders, and membership options in one place.
                </p>
            </div>
            <div className="mt-8 max-w-5xl">
                <SubscriptionFormSettings user={user} />
            </div>
        </div>
    );
}

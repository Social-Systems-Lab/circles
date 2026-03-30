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
        <div className="min-w-0 flex-1 py-6">
            <div className="w-full max-w-5xl space-y-8 px-4 sm:px-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Manage your verification thread and membership options in one place.
                    </p>
                </div>
                <SubscriptionFormSettings user={user} />
            </div>
        </div>
    );
}

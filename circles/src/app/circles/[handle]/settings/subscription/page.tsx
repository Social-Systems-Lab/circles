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
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Subscription</h1>
            <p className="mb-6 text-muted-foreground">
                Manage your verification thread and membership options in one place.
            </p>
            <SubscriptionFormSettings user={user} />
        </div>
    );
}

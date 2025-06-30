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

    return <SubscriptionFormSettings user={user} />;
}

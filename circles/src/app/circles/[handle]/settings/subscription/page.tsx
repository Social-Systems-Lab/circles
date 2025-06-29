import { getCircleByHandle } from "@/lib/data/circle";
import SubscriptionForm from "./subscription-form";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circle } from "@/models/models";
import { getUserPrivate } from "@/lib/data/user";

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

    return <SubscriptionForm circle={user} />;
}

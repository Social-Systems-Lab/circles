import { getCircleByHandle } from "@/lib/data/circle";
import SubscriptionForm from "./subscription-form";

type SubscriptionProps = {
    params: Promise<{ handle: string }>;
};

export default async function SubscriptionPage(props: SubscriptionProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return <SubscriptionForm circle={circle} />;
}

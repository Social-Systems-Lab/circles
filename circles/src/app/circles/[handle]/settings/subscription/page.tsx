import { getCircleByHandle } from "@/lib/data/circle";
import SubscriptionForm from "./subscription-form";

export default async function SubscriptionPage({ params }: { params: { handle: string } }) {
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return <SubscriptionForm circle={circle} />;
}

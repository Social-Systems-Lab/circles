import { getCircleByHandle } from "@/lib/data/circle";
import { getCircleDefaultPath } from "@/lib/utils/circle-routes";
import { redirect } from "next/navigation";
import { canReadCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";

type HomeProps = {
    params: Promise<{ handle: string }>;
};

export default async function Home(props: HomeProps) {
    const params = await props.params;
    let circle = await getCircleByHandle(params.handle);
    if (!circle || !canReadCircleByLifecycle(circle)) {
        // redirect to not-found
        redirect("/not-found");
    }

    redirect(getCircleDefaultPath(circle));
}

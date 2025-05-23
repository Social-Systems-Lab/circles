import { getCircleByHandle } from "@/lib/data/circle";
import { redirect } from "next/navigation";

type HomeProps = {
    params: Promise<{ handle: string }>;
};

export default async function Home(props: HomeProps) {
    const params = await props.params;
    let circle = await getCircleByHandle(params.handle);
    if (!circle) {
        // redirect to not-found
        redirect("/not-found");
    }

    // redirect to first module in circle
    let defaultModule = circle?.enabledModules?.[0] ?? "home";

    redirect(`/circles/${params.handle}/${defaultModule}`);
}

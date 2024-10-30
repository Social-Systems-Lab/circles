import { getCircleByHandle } from "@/lib/data/circle";
import HomeModule from "@/components/modules/home/home";
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

    return <HomeModule circle={circle} isDefaultCircle={false} />;
}

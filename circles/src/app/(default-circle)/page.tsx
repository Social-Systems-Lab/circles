import { getDefaultCircle } from "@/lib/data/circle";
import HomeModule from "@/components/modules/home/home";

export default async function Home() {
    let circle = await getDefaultCircle();

    // return <div>{process.env.version}</div>;

    return <HomeModule circle={circle} isDefaultCircle={true} />;
}

export const dynamic = "force-dynamic";

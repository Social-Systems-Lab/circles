import { getDefaultCircle } from "@/lib/data/circle";
import HomeModule from "@/components/modules/home/home";

export default async function Home() {
    let circle = await getDefaultCircle(true);
    return <HomeModule circle={circle} />;
}

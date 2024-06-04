import { getCircleByHandle } from "@/lib/data/circle";
import HomeModule from "@/components/modules/home/home";

type HomeProps = {
    params: { handle: string };
};

export default async function Home({ params }: HomeProps) {
    let circle = await getCircleByHandle(params.handle);
    return <HomeModule circle={circle} />;
}

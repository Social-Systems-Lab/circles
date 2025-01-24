// main app home feed
import FeedsModule from "@/components/modules/feeds/feeds";
import HomeModule from "@/components/modules/home/home";
import HomeContent from "@/components/modules/home/home-content";
import HomeCover from "@/components/modules/home/home-cover";
import { getDefaultCircle } from "@/lib/data/circle";

type HomeProps = {
    params: Promise<{ handle: string }>;
};

export default async function Home(props: HomeProps) {
    const circle = await getDefaultCircle();

    return (
        <>
            <HomeCover circle={circle} isDefaultCircle={true} authorizedToEdit={false} />
            <HomeContent circle={circle} isDefaultCircle={true} authorizedToEdit={false} />
        </>
    );
}

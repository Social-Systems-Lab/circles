import { getCircleByHandle } from "@/lib/data/circle";
import HomeModule from "@/components/modules/home/home";
import { redirect } from "next/navigation";
import FeedsModule from "@/components/modules/feeds/feeds";
import { getServerSettings } from "@/lib/data/server-settings";
import { MapDisplay } from "@/components/map/map";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

type MapProps = {
    params: Promise<{ handle: string }>;
};

export default async function Map(props: MapProps) {
    const params = await props.params;
    let serverConfig = await getServerSettings();

    // let circle = await getCircleByHandle(params.handle);
    // if (!circle) {
    //     // redirect to not-found
    //     redirect("/not-found");
    // }

    //redirect(`/circles/${params.handle}/feeds`);

    // get members of circle
    let userDid = await getAuthenticatedUserDid();

    // TODO get members of user circle
    // TODO get user circles

    return (
        <ContentDisplayWrapper content={[]}>
            <MapDisplay mapboxKey={serverConfig?.mapboxKey ?? ""} />
        </ContentDisplayWrapper>
    );
}

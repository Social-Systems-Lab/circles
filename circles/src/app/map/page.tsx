import { getServerSettings } from "@/lib/data/server-settings";
import { MapDisplay } from "@/components/map/map";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { Circle, Content, SortingOptions, WithMetric } from "@/models/models";
import { getCirclesWithMetrics } from "@/lib/data/circle";

type MapProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Map(props: MapProps) {
    let serverConfig = await getServerSettings();

    // get all circles
    const searchParams = await props.searchParams;
    let activeTab = searchParams?.tab as string;

    // get user handle
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return null;
    }

    let circles: WithMetric<Circle>[] = [];
    //let user = await getUserPrivate(userDid);
    // if (activeTab === "following" || !activeTab) {
    //     const memberIds =
    //         user?.memberships
    //             ?.filter((m) => m.circle.circleType !== "user" && m.circle.handle !== "default")
    //             ?.map((membership) => membership.circle?._id) || [];
    //     let memberCircles = await getCirclesByIds(memberIds);
    //     circles = await getMetricsForCircles(memberCircles, userDid, searchParams?.sort as SortingOptions);
    // } else {
    circles = await getCirclesWithMetrics(userDid, undefined, searchParams?.sort as SortingOptions);
    // }

    return (
        <ContentDisplayWrapper content={circles}>
            <MapDisplay mapboxKey={serverConfig?.mapboxKey ?? ""} />
        </ContentDisplayWrapper>
    );
}

import { getCircleByHandle, getCircleById } from "@/lib/data/circle";
import HomeModule from "@/components/modules/home/home";
import { redirect } from "next/navigation";
import FeedsModule from "@/components/modules/feeds/feeds";
import { getServerSettings } from "@/lib/data/server-settings";
import { MapDisplay } from "@/components/map/map";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserByDid, getUserPrivate } from "@/lib/data/user";
import { getMembersWithMetrics } from "@/lib/data/member";
import { Content, SortingOptions } from "@/models/models";

type MapProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Map(props: MapProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    let serverConfig = await getServerSettings();

    // get members of circle
    let userDid = await getAuthenticatedUserDid();
    let content: Content[] = [];
    if (userDid) {
        let user = await getUserPrivate(userDid);
        const connections = user?.memberships?.map((membership) => membership.circle) || [];
        content = connections;
    }

    return (
        <ContentDisplayWrapper content={content}>
            <MapDisplay mapboxKey={serverConfig?.mapboxKey ?? ""} />
        </ContentDisplayWrapper>
    );
}

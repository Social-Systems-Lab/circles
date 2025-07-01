// \app\page.tsx - default app route showing hybrid map and card swipe interface
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCirclesWithMetrics, getMetricsForCircles, getSwipeCircles } from "@/lib/data/circle";
import { getServerSettings } from "@/lib/data/server-settings";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import MapExplorer from "@/components/modules/circles/map-explorer";
import { redirect } from "next/navigation";
import { SortingOptions } from "@/models/models";

type HomeProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home(props: HomeProps) {
    const searchParams = await props.searchParams;
    let sort = (searchParams?.sort as string) ?? "";

    const userDid = await getAuthenticatedUserDid();

    // Get server settings for Mapbox key
    const serverConfig = await getServerSettings();

    // Get circles with location data for the map and cards
    const circles = await getSwipeCircles();
    const circlesWithMetrics = await getMetricsForCircles(circles, userDid, sort as SortingOptions);

    return (
        <ContentDisplayWrapper content={circlesWithMetrics}>
            <MapExplorer allDiscoverableCircles={circlesWithMetrics} mapboxKey={serverConfig?.mapboxKey ?? ""} />
        </ContentDisplayWrapper>
    );
}

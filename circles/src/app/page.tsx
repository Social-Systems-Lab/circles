// \app\page.tsx - default app route showing hybrid map and card swipe interface
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCirclesWithMetrics } from "@/lib/data/circle";
import { getServerSettings } from "@/lib/data/server-settings";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import MapSwipeContainer from "@/components/modules/circles/map-swipe-container";
import { redirect } from "next/navigation";
import { SortingOptions } from "@/models/models";

type HomeProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home(props: HomeProps) {
    const searchParams = await props.searchParams;
    let sort = searchParams?.sort as string;

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/welcome");
    }

    // Get server settings for Mapbox key
    const serverConfig = await getServerSettings();

    // Get circles with location data for the map and cards
    const circles = await getCirclesWithMetrics(userDid, undefined, sort as SortingOptions);

    return (
        <ContentDisplayWrapper content={circles}>
            <MapSwipeContainer circles={circles} mapboxKey={serverConfig?.mapboxKey ?? ""} />
        </ContentDisplayWrapper>
    );
}

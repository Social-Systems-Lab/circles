// main circles list
import CirclesList from "@/components/modules/circles/circles-list";
import { getAggregatePostsAction } from "@/components/modules/feeds/actions";
import { AggregateFeedComponent, FeedComponent } from "@/components/modules/feeds/feed";
import { ThirdColumn } from "@/components/modules/feeds/third-column";
import HomeContent from "@/components/modules/home/home-content";
import HomeCover from "@/components/modules/home/home-cover";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCirclesWithMetrics, getDefaultCircle, getMetricsForCircles } from "@/lib/data/circle";
import { getPublicUserFeed } from "@/lib/data/feed";
import { getUserByDid, getUserPrivate } from "@/lib/data/user";
import { Page, SortingOptions } from "@/models/models";

type CirclesProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home(props: CirclesProps) {
    // get user handle
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return null;
    }

    let user = await getUserPrivate(userDid);
    const searchParams = await props.searchParams;

    const memberCircles =
        user?.memberships?.filter((m) => m.circle.circleType !== "user")?.map((membership) => membership.circle) || [];

    let circles = await getMetricsForCircles(memberCircles, userDid, searchParams?.sort as SortingOptions);

    return (
        <div className="mt-14 flex flex-1 flex-row justify-center overflow-hidden">
            {/* <div className="mb-4 mt-16 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-4"> */}
            <CirclesList circle={user} circles={circles} isDefaultCircle={false} />
            {/* </div> */}
        </div>
    );
}

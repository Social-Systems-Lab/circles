// projects/page.tsx - projects list
import CirclesList from "@/components/modules/circles/circles-list";
import CirclesTabs from "@/components/modules/circles/circles-tab";
import { getAggregatePostsAction } from "@/components/modules/feeds/actions";
import { AggregateFeedComponent, FeedComponent } from "@/components/modules/feeds/feed";
import { ThirdColumn } from "@/components/modules/feeds/third-column";
import HomeContent from "@/components/modules/home/home-content";
import HomeCover from "@/components/modules/home/home-cover";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCirclesByIds, getCirclesWithMetrics, getDefaultCircle, getMetricsForCircles } from "@/lib/data/circle";
import { getPublicUserFeed } from "@/lib/data/feed";
import { getUserByDid, getUserPrivate } from "@/lib/data/user";
import { Circle, Page, SortingOptions, WithMetric } from "@/models/models";

type ProjectsProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Projects(props: ProjectsProps) {
    const searchParams = await props.searchParams;
    let activeTab = searchParams?.tab as string;
    
    // get user handle
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return null;
    }

    let circles: WithMetric<Circle>[] = [];
    let user = await getUserPrivate(userDid);
    
    // Always use project type for this page
    const filterType = "project";
    
    if (activeTab === "following" || !activeTab) {
        const memberIds =
            user?.memberships
                ?.filter((m) => m.circle.circleType === filterType && m.circle.handle !== "default")
                ?.map((membership) => membership.circle?._id) || [];
        let memberCircles = await getCirclesByIds(memberIds);
        circles = await getMetricsForCircles(memberCircles, userDid, searchParams?.sort as SortingOptions);
    } else {
        circles = await getCirclesWithMetrics(userDid, undefined, searchParams?.sort as SortingOptions, filterType);

        // remove circles that are in the users memberships
        const memberIds = user?.memberships?.map((m) => m.circle._id) || [];
        circles = circles.filter((c) => !memberIds.includes(c._id));
    }

    return (
        <div className="mt-14 flex flex-1 flex-col justify-center overflow-hidden">
            <div className="flex flex-1 flex-row justify-center overflow-hidden">
                <div className="ml-4 mr-4 flex max-w-[1100px] flex-1 flex-col">
                    <CirclesTabs currentTab={activeTab} circleType={filterType} />
                </div>
            </div>
            <CirclesList 
                circle={user} 
                circles={circles} 
                isDefaultCircle={false} 
                activeTab={activeTab} 
                isProjectsList={true} 
            />
        </div>
    );
}
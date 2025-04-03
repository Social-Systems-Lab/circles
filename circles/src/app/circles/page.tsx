// circles/page.tsx - circles list
import CirclesList from "@/components/modules/circles/circles-list";
import CirclesTabs from "@/components/modules/circles/circles-tab";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCirclesByIds, getCirclesWithMetrics, getMetricsForCircles } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import { Circle, SortingOptions, WithMetric } from "@/models/models";

type CirclesProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home(props: CirclesProps) {
    const searchParams = await props.searchParams;
    let activeTab = searchParams?.tab as string;
    let circleType = searchParams?.circleType as "circle" | "project" | undefined;

    // get user handle
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return null;
    }

    let circles: WithMetric<Circle>[] = [];
    let user = await getUserPrivate(userDid);

    // Default to circle type if not specified
    const filterType = circleType || "circle";

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
                    <CirclesTabs currentTab={activeTab} circleType={circleType} />
                </div>
            </div>
            <CirclesList
                circle={user}
                circles={circles}
                isDefaultCircle={false}
                activeTab={activeTab}
                isProjectsList={circleType === "project"}
            />
            {/* </div> */}
        </div>
    );
}

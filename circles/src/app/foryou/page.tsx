// \app\page.tsx - default app route showing home aggregate feed
import { getAggregatePostsAction, getGlobalPostsAction } from "@/components/modules/feeds/actions";
import { AggregateFeedComponent } from "@/components/modules/feeds/feed";
import FeedTabs from "@/components/modules/feeds/feeds-tab";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getPublicUserFeed } from "@/lib/data/feed";
import { PostDisplay, SortingOptions } from "@/models/models";
import { redirect } from "next/navigation";

type ForYouProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ForYou(props: ForYouProps) {
    const searchParams = await props.searchParams;
    let activeTab = searchParams?.tab as string;

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/welcome");
    }

    let posts: PostDisplay[] = [];

    // Get user feed regardless of active tab, so it's available for posting in any tab
    let userFeed = await getPublicUserFeed(userDid);
    console.log("Getting user public feed for", userDid, userFeed?.handle);

    if (activeTab === "following" || !activeTab) {
        console.log("Getting aggregate posts for user", userDid);
        posts = await getAggregatePostsAction(userDid, 20, 0, searchParams?.sort as SortingOptions);
    } else {
        // For the "For You" tab, use a new function that fetches global posts
        posts = await getGlobalPostsAction(userDid, 20, 0, searchParams?.sort as SortingOptions);
    }

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 mt-14 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-14">
                <FeedTabs currentTab={activeTab} />
                <AggregateFeedComponent posts={posts} userFeed={userFeed!} activeTab={activeTab} />
            </div>
        </div>
    );
}

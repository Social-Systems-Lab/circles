// main app home aggregate feed
import { getAggregatePostsAction } from "@/components/modules/feeds/actions";
import { AggregateFeedComponent, FeedComponent } from "@/components/modules/feeds/feed";
import { ThirdColumn } from "@/components/modules/feeds/third-column";
import HomeContent from "@/components/modules/home/home-content";
import HomeCover from "@/components/modules/home/home-cover";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getDefaultCircle } from "@/lib/data/circle";
import { getPublicUserFeed } from "@/lib/data/feed";
import { SortingOptions } from "@/models/models";

type HomeProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home(props: HomeProps) {
    const searchParams = await props.searchParams;

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return null;
    }

    const posts = await getAggregatePostsAction(userDid, 20, 0, searchParams?.sort as SortingOptions);
    const userFeed = await getPublicUserFeed(userDid);

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 mt-16 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-4">
                <AggregateFeedComponent posts={posts} userFeed={userFeed!} />;
            </div>
        </div>
    );
}

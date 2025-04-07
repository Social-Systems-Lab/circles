// feeds.tsx

"use server";

import { getFeedByHandle, getPosts } from "@/lib/data/feed";
import { FeedComponent } from "./feed";
import { ThirdColumn } from "./third-column";
import { getPostsAction } from "./actions";
import { Circle, SortingOptions } from "@/models/models";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";

type PageProps = {
    circle: Circle;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeedsModule(props: PageProps) {
    const circle = props.circle;
    const searchParams = await props.searchParams;

    // Always use the default feed
    const feed = await getFeedByHandle(circle?._id, "default");
    if (!feed) {
        return <div></div>;
    }
    const posts = await getPostsAction(feed._id, circle._id, 20, 0, searchParams?.sort as SortingOptions);

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 mt-2 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4">
                <FeedComponent posts={posts} feed={feed} circle={circle} />;
            </div>
        </div>
    );
}

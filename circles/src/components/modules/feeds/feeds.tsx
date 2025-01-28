// feeds.tsx

"use server";

import { ModulePageProps } from "../dynamic-page";
import { getFeedByHandle, getPosts } from "@/lib/data/feed";
import { FeedComponent } from "./feed";
import { ThirdColumn } from "./third-column";
import { getPostsAction } from "./actions";
import { SortingOptions } from "@/models/models";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";

export default async function FeedsModule({ circle, page, subpage, isDefaultCircle, searchParams }: ModulePageProps) {
    const feed = await getFeedByHandle(circle?._id, subpage);
    if (!feed) {
        return <div></div>;
    }
    const posts = await getPostsAction(feed._id, circle._id, 20, 0, searchParams?.sort as SortingOptions);

    return (
        <ContentDisplayWrapper content={posts}>
            <FeedComponent
                posts={posts}
                feed={feed}
                circle={circle}
                page={page}
                subpage={subpage}
                isDefaultCircle={isDefaultCircle}
            />
            <ThirdColumn />
        </ContentDisplayWrapper>
    );
}

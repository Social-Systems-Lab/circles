"use server";

import { ModulePageProps } from "../dynamic-page";
import { getFeedByHandle, getPosts } from "@/lib/data/feed";
import { FeedComponent } from "./feed";
import { redirect } from "next/navigation";

export default async function FeedsModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    const feed = await getFeedByHandle(circle?._id, subpage);
    if (!feed) {
        return <div></div>;
    }

    // get posts for feed
    const posts = await getPosts(feed._id, 20, 0);

    return (
        <>
            <FeedComponent posts={posts} feed={feed} circle={circle} page={page} subpage={subpage} />
            <div className="flex flex-1"></div>
        </>
    );
}

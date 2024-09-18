"use server";

import { ModulePageProps } from "../dynamic-page";
import { getFeedByHandle, getPosts } from "@/lib/data/feed";
import { FeedComponent } from "./feed";
import { redirect } from "next/navigation";
import { ThirdColumn } from "./third-column";
import { feedFeaturePrefix } from "@/lib/data/constants";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";

export default async function FeedsModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    const feed = await getFeedByHandle(circle?._id, subpage);
    if (!feed) {
        return <div></div>;
    }

    let userDid = undefined;
    try {
        userDid = await getAuthenticatedUserDid();
    } catch (error) {}

    // get posts for feed
    const posts = await getPosts(feed._id, userDid, 20, 0);

    return (
        <>
            <FeedComponent
                posts={posts}
                feed={feed}
                circle={circle}
                page={page}
                subpage={subpage}
                isDefaultCircle={isDefaultCircle}
            />
            <ThirdColumn />
        </>
    );
}

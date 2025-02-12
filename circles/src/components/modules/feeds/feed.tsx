// feed.tsx - component for displaying feeds
"use client";

import DynamicForm from "@/components/forms/dynamic-form";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, Page, PostDisplay } from "@/models/models";
import { CreateNewPost } from "./create-new-post";
import PostList from "./post-list";
import CircleHeader from "../circles/circle-header";
import { feedFeaturePrefix, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { isAuthorized } from "@/lib/auth/client-auth";
import { useRouter } from "next/navigation";
import { ListFilter } from "@/components/utils/list-filter";
import { Button } from "@/components/ui/button";
import emptyFeed from "@images/empty-feed.png";
import Image from "next/image";
import { updateQueryParam } from "@/lib/utils/helpers-client";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { useEffect } from "react";

export type FeedComponentProps = {
    circle: Circle;
    posts: PostDisplay[];
    page: Page;
    feed: Feed;
    subpage?: string;
    isDefaultCircle?: boolean;
};

export const FeedComponent = ({ circle, posts, page, subpage, feed, isDefaultCircle }: FeedComponentProps) => {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);

    // check if authorized to post
    const canPostFeature = feedFeaturePrefix + feed?.handle + "_post";
    const canPost = isAuthorized(user, circle, canPostFeature);

    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.FeedComponent.1");
        }
    }, []);

    const handleFilterChange = (filter: string) => {
        updateQueryParam(router, "sort", filter);
    };

    return (
        <div
            className={`flex h-full min-h-screen flex-1 items-start justify-center`}
            // `flex h-full min-h-screen flex-1 items-start justify-center bg-white ${isCompact ? "" : "mt-3 overflow-hidden rounded-t-[15px]"}`
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "700px",
            }}
        >
            <div className="flex w-full flex-col">
                {/* <div className="mt-4">
                    <CircleHeader
                        circle={circle}
                        page={page}
                        subpage={feed.handle && feed.handle !== "default" ? feed.name : undefined}
                        isDefaultCircle={isDefaultCircle}
                    />
                </div> */}
                {canPost && (
                    <div>
                        {/* className="mt-6" */}
                        <CreateNewPost circle={circle} feed={feed} page={page} subpage={subpage} />
                    </div>
                )}
                <ListFilter onFilterChange={handleFilterChange} />

                <PostList posts={posts} feed={feed} circle={circle} page={page} subpage={subpage} />
            </div>
        </div>
    );
};

export type AggregateFeedComponentProps = {
    posts: PostDisplay[];
    userFeed: Feed;
    activeTab: string;
};

export const AggregateFeedComponent = ({ posts, userFeed, activeTab }: AggregateFeedComponentProps) => {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);
    const isMobile = useIsMobile();

    // check if authorized to post
    const canPost = true;

    const router = useRouter();

    const handleFilterChange = (filter: string) => {
        updateQueryParam(router, "sort", filter);
    };

    // If no posts in the "Following" feed, show a placeholder
    if (posts.length === 0 && activeTab === "following") {
        return (
            <div className="flex h-full flex-col items-center justify-center">
                {canPost && (
                    <div className="flex w-full pb-4">
                        {/* className="mt-6" */}
                        <CreateNewPost circle={user as Circle} feed={userFeed} />
                    </div>
                )}
                <Image src={emptyFeed} alt="No posts yet" width={isMobile ? 230 : 300} />
                <h4>No posts</h4>
                <div className="max-w-[700px] pl-4 pr-4">
                    We couldn&apos;t find any posts. Try the discover tab to find new content and start following users
                    and circles.
                </div>
                <div className="mt-4 flex flex-row gap-2">
                    <Button variant={"outline"} onClick={() => updateQueryParam(router, "tab", "discover")}>
                        Discover
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`flex h-full min-h-screen flex-1 items-start justify-center`}
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "700px",
            }}
        >
            <div className="flex w-full flex-col">
                {canPost && (
                    <div>
                        {/* className="mt-6" */}
                        <CreateNewPost circle={user as Circle} feed={userFeed} />
                    </div>
                )}
                <ListFilter onFilterChange={handleFilterChange} />

                <PostList posts={posts} isAggregateFeed={true} />
            </div>
        </div>
    );
};

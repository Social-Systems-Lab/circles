"use client";

import DynamicForm from "@/components/forms/dynamic-form";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, Page, PostDisplay } from "@/models/models";
import { CreateNewPost } from "./create-new-post";
import PostList from "./post-list";
import CircleHeader from "../circles/circle-header";

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
                <div className="mt-4">
                    <CircleHeader
                        circle={circle}
                        page={page}
                        subpage={feed.handle && feed.handle !== "default" ? feed.name : undefined}
                        isDefaultCircle={isDefaultCircle}
                    />
                </div>
                <div>
                    {/* className="mt-6" */}
                    <CreateNewPost circle={circle} feed={feed} />
                </div>
                <PostList posts={posts} feed={feed} circle={circle} />
            </div>
        </div>
    );
};

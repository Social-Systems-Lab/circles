"use client";

import DynamicForm from "@/components/forms/dynamic-form";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, Page, PostDisplay } from "@/models/models";
import { CreateNewPost } from "./create-new-post";
import PostList from "./post-list";
import { whiteUi } from "@/lib/data/constants";

export type FeedComponentProps = {
    circle: Circle;
    posts: PostDisplay[];
    page: Page;
    feed: Feed;
    subpage?: string;
};

export const FeedComponent = ({ circle, posts, page, subpage, feed }: FeedComponentProps) => {
    const isCompact = useIsCompact();

    return (
        <div
            className={
                whiteUi
                    ? `flex h-full min-h-screen flex-1 items-start justify-center ${isCompact ? "" : "border-l border-r border-gray-200"}`
                    : `flex h-full min-h-screen flex-1 items-start justify-center`
            }
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "700px",
            }}
        >
            <div className="flex w-full flex-col">
                <CreateNewPost circle={circle} feed={feed} />
                <PostList posts={posts} feed={feed} circle={circle} />
            </div>
        </div>
    );
};

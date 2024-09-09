"use client";

import DynamicForm from "@/components/forms/dynamic-form";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, Page, PostDisplay } from "@/models/models";
import { CreateNewPost } from "./create-new-post";
import PostList from "./post-list";

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
            className={`flex h-full flex-1 items-start justify-center ${isCompact ? "pl-4 pr-4" : ""}`}
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

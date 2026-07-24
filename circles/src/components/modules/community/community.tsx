"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getPostsAction } from "@/components/modules/feeds/actions";
import { Circle, Feed, PostDisplay } from "@/models/models";
import { CommunityFeed } from "./community-feed";

type CommunityModuleProps = {
    circle: Circle;
    feed: Feed;
};

export default function CommunityModule({ circle, feed }: CommunityModuleProps) {
    const [posts, setPosts] = useState<PostDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [, startTransition] = useTransition();

    const fetchPosts = useCallback(async () => {
        setIsLoading(true);
        startTransition(async () => {
            try {
                const communityPosts = await getPostsAction(feed._id, circle._id, 20, 0, "new", undefined, "community");
                setPosts(communityPosts);
            } finally {
                setIsLoading(false);
            }
        });
    }, [circle._id, feed._id]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    return (
        <div className="flex flex-1 justify-center overflow-hidden">
            <div className="mb-4 mt-2 flex w-full max-w-[1280px] flex-col items-center md:ml-4 md:mr-4">
                <CommunityFeed posts={posts} feed={feed} circle={circle} isLoading={isLoading} />
            </div>
        </div>
    );
}

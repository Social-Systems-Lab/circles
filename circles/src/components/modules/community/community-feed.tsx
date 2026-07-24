"use client";

import Image from "next/image";
import { Circle, Feed, PostDisplay } from "@/models/models";
import PostList from "@/components/modules/feeds/post-list";

type CommunityFeedProps = {
    circle: Circle;
    feed: Feed;
    posts: PostDisplay[];
    isLoading?: boolean;
};

export function CommunityFeed({ circle, feed, posts, isLoading = false }: CommunityFeedProps) {
    if (isLoading) {
        return (
            <div className="flex h-full min-h-[320px] w-full flex-1 items-center justify-center">
                <div className="flex w-full max-w-[700px] flex-col items-center text-center">
                    <Image src="/images/kamooni_logo.png" alt="Kamooni logo" width={72} height={72} priority />
                    <p className="mt-4 text-sm font-medium text-gray-600">Community loading...</p>
                </div>
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="flex min-h-[320px] w-full items-center justify-center px-4 text-center">
                <div className="max-w-[520px]">
                    <h2 className="text-xl font-semibold text-gray-900">No community posts yet</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Informal member conversations, questions, sharing, and images will appear here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-screen w-full flex-1 items-start justify-center">
            <div className="flex w-full max-w-[700px] flex-col">
                <PostList posts={posts} feed={feed} circle={circle} readOnly />
            </div>
        </div>
    );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useAtom } from "jotai";
import { useSearchParams } from "next/navigation";
import { AggregateFeedComponent } from "@/components/modules/feeds/feed";
import FeedTabs from "@/components/modules/feeds/feeds-tab";
import {
    getAggregatePostsAction,
    getGlobalPostsAction,
    getPublicUserFeedAction,
} from "@/components/modules/feeds/actions";
import { PostDisplay, SortingOptions, Feed } from "@/models/models";
import { userAtom } from "@/lib/data/atoms";

export default function ActivityPanel() {
    const [user] = useAtom(userAtom);
    const searchParams = useSearchParams();
    const [posts, setPosts] = useState<PostDisplay[]>([]);
    const [userFeed, setUserFeed] = useState<Feed | null>(null);
    const [isPending, startTransition] = useTransition();

    const userDid = user?.did;

    // Read UI state from URL so back/forward works consistently
    const activeTab = useMemo(() => {
        const tab = (searchParams.get("tab") as string) || "";
        if (!userDid && !tab) return "discover";
        return tab || "following";
    }, [searchParams, userDid]);

    const sorting = useMemo(() => (searchParams.get("sort") as SortingOptions) || undefined, [searchParams]);
    const selectedSdgs = useMemo(() => {
        const sdgsParam = searchParams.get("sdgs");
        return sdgsParam ? sdgsParam.split(",") : [];
    }, [searchParams]);

    useEffect(() => {
        // Fetch user's public feed (for posting) if logged in
        startTransition(async () => {
            if (userDid) {
                const feed = await getPublicUserFeedAction(userDid);
                setUserFeed(feed);
            } else {
                setUserFeed(null);
            }
        });
    }, [userDid]);

    useEffect(() => {
        startTransition(async () => {
            let newPosts: PostDisplay[] = [];
            if (activeTab === "following" || !activeTab) {
                newPosts = await getAggregatePostsAction(userDid, 20, 0, sorting, selectedSdgs);
            } else {
                newPosts = await getGlobalPostsAction(userDid, 20, 0, sorting, selectedSdgs);
            }
            setPosts(newPosts);
        });
    }, [activeTab, sorting, selectedSdgs.join(","), userDid]);

    return (
        <div className="flex h-full w-full flex-col">
            {/* Tabs should be visible for authenticated users to switch between Following/Discover */}
            {userDid && <FeedTabs currentTab={activeTab} />}
            {/* Reuse aggregate feed renderer */}
            <div className="flex-1 overflow-y-auto">
                <AggregateFeedComponent posts={posts} userFeed={userFeed} activeTab={activeTab} />
            </div>
        </div>
    );
}

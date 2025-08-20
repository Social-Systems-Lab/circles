// feeds.tsx

"use client"; // This component now uses client-side state for filters

import { FeedComponent } from "./feed";
import { getPostsAction, getAggregatePostsAction, getFeedByHandleAction } from "./actions";
import { Circle, SortingOptions, Cause as SDG, PostDisplay } from "@/models/models";
import { ListFilter } from "@/components/utils/list-filter";
import { useState, useEffect, useTransition, useCallback } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

type PageProps = {
    circle: Circle;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function FeedsModule(props: PageProps) {
    const { circle, searchParams: searchParamsProp } = props;
    const [feed, setFeed] = useState<any>(null);
    const [posts, setPosts] = useState<PostDisplay[]>([]);
    const [sorting, setSorting] = useState<SortingOptions>("top");
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>([]);
    const [isPending, startTransition] = useTransition();
    const [user] = useAtom(userAtom);

    const fetchPosts = useCallback(async () => {
        if (!feed) return;

        startTransition(async () => {
            const sdgHandles = selectedSdgs.map((s) => s.handle);
            const newPosts = await getAggregatePostsAction(user?.did, 20, 0, sorting, sdgHandles);
            setPosts(newPosts);
        });
    }, [feed, sorting, selectedSdgs, user]);

    useEffect(() => {
        async function fetchInitialData() {
            const defaultFeed = await getFeedByHandleAction(circle?._id, "default");
            if (defaultFeed) {
                setFeed(defaultFeed);
                const searchParams = await searchParamsProp;
                const initialSort = (searchParams?.sort as SortingOptions) || "top";
                setSorting(initialSort);
            }
        }
        fetchInitialData();
    }, [circle, searchParamsProp]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const handleFilterChange = (filter: string) => {
        setSorting(filter as SortingOptions);
    };

    const handleSdgChange = (sdgs: SDG[]) => {
        setSelectedSdgs(sdgs);
    };

    if (!feed) {
        return <div></div>; // Or a loading spinner
    }

    return (
        <div className="flex flex-1 justify-center overflow-hidden">
            <div className="mb-4 mt-2 flex w-full max-w-[1100px] flex-col items-center md:ml-4 md:mr-4">
                <FeedComponent
                    posts={posts}
                    feed={feed}
                    circle={circle}
                    onFilterChange={handleFilterChange}
                    onSdgChange={handleSdgChange}
                    selectedSdgsExternal={selectedSdgs}
                />
            </div>
        </div>
    );
}

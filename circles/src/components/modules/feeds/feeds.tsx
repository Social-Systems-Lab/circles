// feeds.tsx

"use client"; // This component now uses client-side state for filters

import { getFeedByHandle } from "@/lib/data/feed";
import { FeedComponent } from "./feed";
import { getPostsAction } from "./actions";
import { Circle, SortingOptions, Cause as SDG, PostDisplay } from "@/models/models";
import { ListFilter } from "@/components/utils/list-filter";
import { useState, useEffect, useTransition } from "react";

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

    useEffect(() => {
        async function fetchInitialData() {
            const defaultFeed = await getFeedByHandle(circle?._id, "default");
            if (defaultFeed) {
                setFeed(defaultFeed);
                const searchParams = await searchParamsProp;
                const initialSort = (searchParams?.sort as SortingOptions) || "top";
                setSorting(initialSort);
                const initialPosts = await getPostsAction(defaultFeed._id, circle._id, 20, 0, initialSort, []);
                setPosts(initialPosts);
            }
        }
        fetchInitialData();
    }, [circle, searchParamsProp]);

    const handleFilterChange = (filter: string) => {
        const newSorting = filter as SortingOptions;
        setSorting(newSorting);
        if (feed) {
            startTransition(async () => {
                const newPosts = await getPostsAction(
                    feed._id,
                    circle._id,
                    20,
                    0,
                    newSorting,
                    selectedSdgs.map((s) => s.handle),
                );
                setPosts(newPosts);
            });
        }
    };

    const handleSdgChange = (sdgs: SDG[]) => {
        setSelectedSdgs(sdgs);
        if (feed) {
            startTransition(async () => {
                const newPosts = await getPostsAction(
                    feed._id,
                    circle._id,
                    20,
                    0,
                    sorting,
                    sdgs.map((s) => s.handle),
                );
                setPosts(newPosts);
            });
        }
    };

    if (!feed) {
        return <div></div>; // Or a loading spinner
    }

    return (
        <div className="flex flex-1 justify-center overflow-hidden">
            <div className="mb-4 mt-2 flex w-full max-w-[1100px] flex-col items-center md:ml-4 md:mr-4">
                <ListFilter
                    onFilterChange={handleFilterChange}
                    onSdgChange={handleSdgChange}
                    selectedSdgs={selectedSdgs}
                />
                <FeedComponent posts={posts} feed={feed} circle={circle} />
            </div>
        </div>
    );
}

// feed.tsx - component for displaying feeds
"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, PostDisplay, Cause as SDG } from "@/models/models"; // Removed DynamicForm and Page imports
//import { CreateNewPost } from "./create-new-discussion";
import DiscussionList from "./discussion-list";
import { features, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
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
import { useEffect, useState, useMemo } from "react";
import { SdgPanel } from "../search/SdgPanel";
import { sdgs } from "@/lib/data/sdgs";
import { ChevronDown } from "lucide-react";

export type FeedComponentProps = {
    circle: Circle;
    posts: PostDisplay[];
    feed: Feed;
    onFilterChange?: (filter: string) => void;
    onSdgChange?: (sdgs: SDG[]) => void;
    selectedSdgsExternal?: SDG[];
};

export const DiscussionComponent = ({
    circle,
    posts,
    feed,
    onFilterChange,
    onSdgChange,
    selectedSdgsExternal,
}: FeedComponentProps) => {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>([]);

    const handleSdgSelectionChange = (sdgs: SDG[]) => {
        setSelectedSdgs(sdgs);
        const sdgHandles = sdgs.map((s) => s.handle);
        updateQueryParam(router, "sdgs", sdgHandles.join(","));
    };

    // check if authorized to post
    const canPost = isAuthorized(user, circle, features.discussions.create);

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
            className={`flex h-full min-h-screen w-full flex-1 items-start justify-center`}
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "700px",
            }}
        >
            <div className="flex w-full flex-col">
                {canPost && (
                    <div>
                        {/* TODO insert create discussion button here */}
                        {/* <CreateNewPost circle={circle} feed={feed} /> */}
                    </div>
                )}
                <ListFilter
                    onFilterChange={onFilterChange ?? handleFilterChange}
                    onSdgChange={onSdgChange ?? handleSdgSelectionChange}
                    selectedSdgs={selectedSdgsExternal ?? selectedSdgs}
                />

                <DiscussionList posts={posts} feed={feed} circle={circle} />
            </div>
        </div>
    );
};

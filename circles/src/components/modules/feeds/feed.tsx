// feed.tsx - component for displaying feeds
"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, PostDisplay, Cause as SDG, SortingOptions } from "@/models/models"; // Removed DynamicForm and Page imports
import { CreateNewPost } from "./create-new-post";
import PostList from "./post-list";
import { PostGrid } from "./post-grid";
import { features, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { isAuthorized } from "@/lib/auth/client-auth";
import { useRouter } from "next/navigation";
import { ListFilter } from "@/components/utils/list-filter";
import { Button } from "@/components/ui/button";
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
    defaultSort?: SortingOptions;
    onFilterChange?: (filter: string) => void;
    onSdgChange?: (sdgs: SDG[]) => void;
    selectedSdgsExternal?: SDG[];
    isLoading?: boolean;
    viewMode?: "list" | "grid"; // Add viewMode prop
};

export const FeedComponent = ({
    circle,
    posts,
    feed,
    defaultSort = "new",
    onFilterChange,
    onSdgChange,
    selectedSdgsExternal,
    isLoading = false,
    viewMode = "list", // Default to list view
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
    const canPost = isAuthorized(user, circle, features.feed.post);

    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.FeedComponent.1");
        }
    }, []);

    const handleFilterChange = (filter: string) => {
        updateQueryParam(router, "sort", filter);
    };

    const containerStyle = {
        flexGrow: isCompact ? "1" : "3",
        maxWidth: isCompact ? "none" : viewMode === "grid" ? "1280px" : "700px",
    };

    if (isLoading) {
        return (
            <div className="flex h-full min-h-[320px] w-full flex-1 items-center justify-center" style={containerStyle}>
                <div className="flex w-full max-w-[700px] flex-col items-center text-center">
                    <Image src="/peerify/logo-mark.png" alt="Peerify logo" width={72} height={72} priority />
                    <p className="mt-4 text-sm font-medium text-gray-600">Feed loading…</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`flex h-full min-h-screen w-full flex-1 items-start justify-center`}
            style={containerStyle}
        >
            <div className="flex w-full flex-col">
                {canPost && (
                    <div className="flex w-full justify-center">
                        <div className="w-full max-w-[700px]">
                            <CreateNewPost circle={circle} feed={feed} />
                        </div>
                    </div>
                )}
                <div className="flex w-full justify-center">
                    <div className="w-full max-w-[700px]">
                        <ListFilter
                            key={defaultSort}
                            defaultValue={defaultSort}
                            onFilterChange={onFilterChange ?? handleFilterChange}
                            onSdgChange={onSdgChange ?? handleSdgSelectionChange}
                            selectedSdgs={selectedSdgsExternal ?? selectedSdgs}
                            showSdgFilter={false}
                        />
                    </div>
                </div>

                {viewMode === "grid" ? (
                    <PostGrid posts={posts} feed={feed} circle={circle} isLoading={false} />
                ) : (
                    <PostList posts={posts} feed={feed} circle={circle} />
                )}
            </div>
        </div>
    );
};

export type AggregateFeedComponentProps = {
    posts: PostDisplay[];
    userFeed: Feed | null;
    activeTab: string;
    defaultSort?: SortingOptions;
    showCreateNew?: boolean; // when false, hide "create post" in aggregate view (e.g., side panel)
    compact?: boolean; // when true, render list in compact/mobile style (e.g., side panel)
    fullWidth?: boolean; // when true, allow the feed to span the available viewport width
    isLoading?: boolean; // when true, show loading placeholder instead of feed content
};

export const AggregateFeedComponent = ({
    posts,
    userFeed,
    activeTab,
    defaultSort = "new",
    showCreateNew = true,
    compact = false,
    fullWidth = false,
    isLoading = false,
}: AggregateFeedComponentProps) => {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);
    const isMobile = useIsMobile();
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>([]);
    const [sdgFilterOpen, setSdgFilterOpen] = useState(false);
    const [sdgSearch, setSdgSearch] = useState("");

    const visibleSdgs = useMemo(() => {
        if (sdgSearch) {
            return sdgs.filter(
                (sdg) =>
                    sdg.name.toLowerCase().includes(sdgSearch.toLowerCase()) ||
                    sdg.description.toLowerCase().includes(sdgSearch.toLowerCase()),
            );
        }
        return sdgs;
    }, [sdgSearch]);

    // check if authorized to post (optionally disabled)
    const canPost = !!user && !!userFeed && showCreateNew;

    const router = useRouter();

    const handleFilterChange = (filter: string) => {
        updateQueryParam(router, "sort", filter);
    };

    const handleSdgSelectionChange = (sdgs: SDG[]) => {
        setSelectedSdgs(sdgs);
        const sdgHandles = sdgs.map((s) => s.handle);
        updateQueryParam(router, "sdgs", sdgHandles.join(","));
    };

    const handleSdgToggle = (sdg: SDG) => {
        const isSelected = selectedSdgs.some((s) => s.handle === sdg.handle);
        if (isSelected) {
            handleSdgSelectionChange(selectedSdgs.filter((s) => s.handle !== sdg.handle));
        } else {
            handleSdgSelectionChange([...selectedSdgs, sdg]);
        }
    };

    if (isLoading) {
        const loadingContainerStyle = fullWidth
            ? { flexGrow: 1, maxWidth: "100%" }
            : {
                  flexGrow: isCompact ? "1" : "3",
                  maxWidth: isCompact ? "none" : "700px",
              };

        return (
            <div className={`flex h-full min-h-[320px] w-full flex-1 items-center justify-center`} style={loadingContainerStyle}>
                <div
                    className={`flex w-full flex-col items-center text-center ${
                        fullWidth ? "mx-auto max-w-[760px] px-4 sm:px-6 lg:px-8" : ""
                    }`}
                >
                    <Image src="/peerify/logo-mark.png" alt="Peerify logo" width={72} height={72} priority />
                    <p className="mt-4 text-base font-medium text-gray-600">Feed loading…</p>
                </div>
            </div>
        );
    }

    // If no posts in the "Following" feed, show a placeholder
    if (posts.length === 0 && activeTab === "following") {
        return (
            <div className="flex h-full flex-col items-center justify-center px-4 py-10">
                {canPost && userFeed && (
                    <div className="flex w-full pb-4">
                        {/* className="mt-6" */}
                        <CreateNewPost circle={user as Circle} feed={userFeed} />
                    </div>
                )}
                <div className="flex w-full max-w-[560px] flex-col items-center rounded-[28px] border border-[#e8dfd2] bg-[#f7f2ea] px-6 py-10 text-center shadow-[0_24px_60px_rgba(24,21,18,0.08)]">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#fff4e8] ring-1 ring-[#efdfca]">
                        <Image src="/peerify/logo-mark.png" alt="Peerify logo" width={52} height={52} priority />
                    </div>
                    <h4 className="mt-5 text-xl font-semibold text-[#181512]">No community updates yet</h4>
                    <div className="mt-3 max-w-[420px] text-sm leading-6 text-[#6b5f52]">
                        Your following feed is still quiet. Explore artists, hosts, and communities to start building a
                        more personal music feed.
                    </div>
                    <div className="mt-6 flex flex-row gap-2">
                        <Button
                            className="bg-[#e8720c] text-[#181512] hover:bg-[#ff8c2a]"
                            onClick={() => updateQueryParam(router, "tab", "discover")}
                        >
                            Explore music communities
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const containerStyle = fullWidth
        ? { flexGrow: 1, maxWidth: "100%" }
        : {
              flexGrow: isCompact ? "1" : "3",
              maxWidth: isCompact ? "none" : "700px",
          };

    return (
        <div className={`flex h-full min-h-screen w-full flex-1 items-start justify-center`} style={containerStyle}>
            <div
                className={`flex w-full flex-col ${
                    fullWidth ? "mx-auto max-w-[760px] px-4 sm:px-6 lg:px-8" : ""
                }`}
            >
                {canPost && userFeed && (
                    <div>
                        {/* className="mt-6" */}
                        <CreateNewPost circle={user as Circle} feed={userFeed} />
                    </div>
                )}
                <div className="flex flex-col gap-2">
                    <div className="flex w-full justify-center">
                        <div className="w-full md:w-auto">
                            <ListFilter
                                defaultValue={defaultSort}
                                onFilterChange={handleFilterChange}
                                onSdgChange={handleSdgSelectionChange}
                                selectedSdgs={selectedSdgs}
                                showSdgFilter={false}
                            />
                        </div>
                    </div>
                </div>

                <PostList posts={posts} isAggregateFeed={true} compact={compact} />
            </div>
        </div>
    );
};

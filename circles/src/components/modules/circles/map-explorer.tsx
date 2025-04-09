// map-explorer.tsx
"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Circle, WithMetric, Content, ContentPreviewData, MemberDisplay } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import { motion } from "framer-motion";
import CircleSwipeCard from "./circle-swipe-card";
import { MapDisplay } from "@/components/map/map";
import { Button } from "@/components/ui/button";
import { RefreshCw, Hand, Home, Search, X, ArrowLeft, ChevronRight } from "lucide-react"; // Added ArrowLeft
import { MdOutlineTravelExplore } from "react-icons/md";
import { HiChevronRight, HiMiniSquare2Stack } from "react-icons/hi2";
import { useAtom } from "jotai";
import {
    userAtom,
    zoomContentAtom,
    displayedContentAtom,
    contentPreviewAtom, // Import contentPreviewAtom
} from "@/lib/data/atoms";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CirclePicture } from "./circle-picture";
import { completeSwipeOnboardingAction } from "./swipe-actions";
import { useRouter } from "next/navigation";
import { searchContentAction } from "../search/actions";
import CategoryFilter from "../search/category-filter";
import Indicators from "@/components/utils/indicators";
import ResizingDrawer from "@/components/ui/resizing-drawer"; // Correct import name
import ContentPreview from "@/components/layout/content-preview";

// mapItemToContent helper remains the same
const mapItemToContent = (item: WithMetric<Content> | Circle | undefined): Content | null => {
    // ... (no changes) ...
    if (!item) return null;
    if ("metrics" in item && item.metrics) {
        const { metrics, ...contentData } = item;
        return {
            ...contentData,
            metrics: {
                similarity: metrics.similarity,
                searchRank: metrics.searchRank,
            },
        } as Content;
    }
    if ("circleType" in item || "type" in item) {
        return { ...item, metrics: {} } as Content;
    }
    console.warn("Unmappable item type in mapItemToContent:", item);
    return null;
};

interface MapExplorerProps {
    allDiscoverableCircles: WithMetric<Circle>[];
    mapboxKey: string;
}

type ViewMode = "cards" | "explore";

// Define snap point indices for clarity
const SNAP_INDEX_CLOSED = -1; // Not used by resizing drawer, but conceptually useful
const SNAP_INDEX_PEEK = 0; // Smallest height (e.g., 100px)
const SNAP_INDEX_HALF = 1; // Medium height (e.g., 40%)
const SNAP_INDEX_OPEN = 2; // Large height (e.g., 80%)
const SNAP_INDEX_FULL = 3; // Full height (e.g., 100%)

export const MapExplorer: React.FC<MapExplorerProps> = ({ allDiscoverableCircles, mapboxKey }) => {
    // --- State ---
    const [currentIndex, setCurrentIndex] = useState(0);
    const [user, setUser] = useAtom(userAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const [displayedContent, setDisplayedContent] = useAtom(displayedContentAtom);
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom); // Get value and setter
    const isMobile = useIsMobile();
    const { windowWidth, windowHeight } = useWindowDimensions();
    const router = useRouter();
    const [viewMode, setViewMode] = useState<ViewMode>("cards");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [allSearchResults, setAllSearchResults] = useState<WithMetric<Circle>[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    // State to control the drawer's active snap index
    const [drawerSnapIndex, setDrawerSnapIndex] = useState(SNAP_INDEX_PEEK); // Start at peek height
    const [isMounted, setIsMounted] = useState(false);
    const [showSwipeInstructions, setShowSwipeInstructions] = useState(false);

    // --- Memos ---
    const snapPoints = useMemo(() => [100, windowHeight * 0.4, windowHeight * 0.8, windowHeight], [windowHeight]);

    const filterCirclesByCategory = useCallback((circles: WithMetric<Circle>[], category: string | null) => {
        // ... (no changes) ...
        if (!category) return circles;
        const typeToFilter = category === "circles" ? "circle" : category === "projects" ? "project" : "user";
        return circles.filter((c) => c.circleType === typeToFilter);
    }, []);

    const displayedSwipeCircles = useMemo(() => {
        // ... (no changes) ...
        if (!user) return [];
        const userFollowedIds = (user.memberships || []).map((m) => m.circleId);
        const userPendingIds = (user.pendingRequests || []).map((r) => r.circleId);
        const userIgnoredIds = user.ignoredCircles || [];
        return allDiscoverableCircles.filter(
            (circle) =>
                !userFollowedIds.includes(circle._id) &&
                !userPendingIds.includes(circle._id) &&
                !userIgnoredIds.includes(circle._id),
        );
    }, [allDiscoverableCircles, user]);

    const filteredSearchResults = useMemo(() => {
        // ... (no changes) ...
        if (!selectedCategory) return allSearchResults;
        const typeToFilter =
            selectedCategory === "circles" ? "circle" : selectedCategory === "projects" ? "project" : "user";
        return allSearchResults.filter((result) => result.circleType === typeToFilter);
    }, [allSearchResults, selectedCategory]);

    const categoryCounts = useMemo(() => {
        // ... (no changes) ...
        const counts: { [key: string]: number } = {
            circles: 0,
            projects: 0,
            users: 0,
        };
        allSearchResults.forEach((result) => {
            if (result.circleType === "circle") counts.circles++;
            else if (result.circleType === "project") counts.projects++;
            else if (result.circleType === "user") counts.users++;
        });
        return counts;
    }, [allSearchResults]);

    // Determine data source for the drawer list
    const drawerListData = useMemo(() => {
        if (hasSearched) {
            return filteredSearchResults;
        } else {
            // When no search, show the same discoverable circles as the map
            // Need to map them to ensure consistent type if needed by list item component
            return filterCirclesByCategory(allDiscoverableCircles, selectedCategory);
            // .map(item => mapItemToContent(item)).filter(Boolean) as Content[]; // Optional mapping
        }
    }, [hasSearched, filteredSearchResults, allDiscoverableCircles, selectedCategory, filterCirclesByCategory]);

    // --- Callbacks ---
    const handleSwiped = useCallback((circle: Circle, direction: "left" | "right") => {
        setCurrentIndex((prev) => prev + 1);
    }, []);

    const handleSetZoomContent = useCallback(
        (item: WithMetric<Circle> | Circle | undefined) => {
            // ... (no changes) ...
            if (!item) {
                setZoomContent(undefined);
                return;
            }
            const mappedItem = mapItemToContent(item);
            if (mappedItem) {
                setZoomContent(mappedItem);
            } else {
                console.warn("Could not map item for zooming:", item);
                setZoomContent(undefined);
            }
        },
        [setZoomContent],
    );

    const handleSearchTrigger = useCallback(async () => {
        const searchCategoriesForBackend = ["circles", "projects", "users"];
        if (!searchQuery.trim()) {
            // If clearing search via empty query, reset state
            setAllSearchResults([]);
            setDisplayedContent(
                filterCirclesByCategory(allDiscoverableCircles, selectedCategory)
                    .map(mapItemToContent)
                    .filter((c): c is Content => c !== null),
            );
            setHasSearched(false);
            setDrawerSnapIndex(SNAP_INDEX_PEEK); // Reset drawer to peek
            setContentPreview(undefined); // Clear preview
            return;
        }
        setIsSearching(true);
        setHasSearched(true);
        setAllSearchResults([]);
        setDisplayedContent([]);
        setContentPreview(undefined); // Clear preview on new search

        try {
            const results = await searchContentAction(searchQuery, searchCategoriesForBackend);
            setAllSearchResults(results);
            // Requirement 1: Jump to half-open state after search
            setDrawerSnapIndex(SNAP_INDEX_HALF);
        } catch (error) {
            console.error("Search action failed:", error);
            setAllSearchResults([]);
            setDrawerSnapIndex(SNAP_INDEX_PEEK); // Reset drawer on error
        } finally {
            setIsSearching(false);
        }
    }, [
        searchQuery,
        setDisplayedContent,
        allDiscoverableCircles,
        selectedCategory,
        filterCirclesByCategory,
        setContentPreview, // Add dependency
    ]);

    const handleClearSearch = useCallback(() => {
        setSearchQuery("");
        setAllSearchResults([]);
        setHasSearched(false);
        setSelectedCategory(null);
        const resetMapData = filterCirclesByCategory(allDiscoverableCircles, null)
            .map((circle) => mapItemToContent(circle))
            .filter((c): c is Content => c !== null);
        setDisplayedContent(resetMapData);
        setDrawerSnapIndex(SNAP_INDEX_PEEK); // Reset drawer to peek
        setContentPreview(undefined); // Clear preview
        console.log("Search cleared, resetting map to all discoverable circles:", resetMapData.length);
    }, [
        setDisplayedContent,
        allDiscoverableCircles,
        filterCirclesByCategory,
        setContentPreview, // Add dependency
    ]);

    const handleExplore = () => {
        setViewMode("explore");
    };
    const goToFeed = () => router.push("/foryou");
    const handleGotIt = async () => {
        // ... (no changes) ...
        setShowSwipeInstructions(false);
        if (user) {
            await completeSwipeOnboardingAction();
            setUser((prevUser) => ({
                ...prevUser!,
                completedOnboardingSteps: [...(prevUser!.completedOnboardingSteps || []), "swipe"],
            }));
        }
    };

    // --- Effects ---
    useEffect(() => setIsMounted(true), []);

    // Reset index when swipe circles change
    useEffect(() => setCurrentIndex(0), [displayedSwipeCircles]);

    // Update map zoom for the current swipe card
    useEffect(() => {
        // ... (no changes) ...
        if (viewMode === "cards" && currentIndex < displayedSwipeCircles.length) {
            const currentCircle = displayedSwipeCircles[currentIndex];
            if (currentCircle?.location?.lngLat) {
                setTimeout(() => handleSetZoomContent(currentCircle), 100);
            }
        }
    }, [currentIndex, displayedSwipeCircles, viewMode, handleSetZoomContent]);

    // Update map markers when in Explore mode
    useEffect(() => {
        // ... (no changes, logic seems correct) ...
        if (viewMode === "explore") {
            let mapData: Content[] = [];
            if (hasSearched) {
                mapData = filteredSearchResults
                    .map((circle) => mapItemToContent(circle))
                    .filter((c): c is Content => c !== null);
            } else {
                mapData = filterCirclesByCategory(allDiscoverableCircles, selectedCategory)
                    .map((circle) => mapItemToContent(circle))
                    .filter((c): c is Content => c !== null);
            }
            setDisplayedContent(mapData);
        }
    }, [
        viewMode,
        hasSearched,
        filteredSearchResults,
        allDiscoverableCircles,
        selectedCategory,
        filterCirclesByCategory,
        setDisplayedContent,
    ]);

    // Control drawer snap based on contentPreview state
    useEffect(() => {
        if (isMobile && viewMode === "explore") {
            if (contentPreview) {
                // Requirement 4: Expand drawer when preview is shown
                setDrawerSnapIndex(SNAP_INDEX_OPEN);
            } else {
                // When preview is closed, return to half if search active, else peek
                setDrawerSnapIndex(hasSearched ? SNAP_INDEX_HALF : SNAP_INDEX_PEEK);
            }
        }
        // Add dependencies that should trigger this logic
    }, [contentPreview, isMobile, viewMode, hasSearched]);

    // Reset drawer and preview when switching view modes or leaving mobile explore
    useEffect(() => {
        if (!isMobile || viewMode !== "explore") {
            setDrawerSnapIndex(SNAP_INDEX_PEEK); // Reset to base state
            setContentPreview(undefined); // Clear preview if leaving explore mode
        }
    }, [isMobile, viewMode, setContentPreview]);

    // Initial focus/map update logic (remains the same)
    useEffect(() => {
        // ... (no changes) ...
        if (viewMode === "cards" && displayedSwipeCircles.length > 0 && currentIndex === 0) {
            const firstCircle = displayedSwipeCircles[0];
            setDisplayedContent([firstCircle].filter(Boolean));
            if (firstCircle?.location?.lngLat) {
                setTimeout(() => handleSetZoomContent(firstCircle), 300);
            }
        }
    }, [displayedSwipeCircles, viewMode, handleSetZoomContent, setDisplayedContent, currentIndex]);

    // Onboarding instructions logic (remains the same)
    useEffect(() => {
        // ... (no changes) ...
        if (
            viewMode === "cards" &&
            user &&
            displayedSwipeCircles.length > 0 &&
            (!user.completedOnboardingSteps || !user.completedOnboardingSteps.includes("swipe"))
        ) {
            setShowSwipeInstructions(true);
        } else {
            setShowSwipeInstructions(false);
        }
    }, [user, displayedSwipeCircles, viewMode]);

    if (!isMounted) return null;

    // --- Render ---
    return (
        <div className="relative flex w-full flex-row overflow-hidden md:h-full">
            {/* Map container */}
            {mapboxKey && (
                <div className="relative flex-1">
                    <MapDisplay mapboxKey={mapboxKey} />
                </div>
            )}

            {/* Top Bar Controls */}
            <div
                className={`absolute ${isMobile ? "flex-col" : "flex-row"} left-4 top-4 z-[60] flex gap-2`} // Increased z-index
            >
                {/* View Mode Toggle */}
                <div className={`flex flex-row gap-1 rounded-full bg-white p-[4px] shadow-md`}>
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`relative h-9 w-9 rounded-full ${viewMode === "cards" ? "bg-[#f1f1f1]" : "bg-white"} hover:bg-[#cecece]`}
                                    onClick={() => setViewMode("cards")}
                                >
                                    <HiMiniSquare2Stack className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Cards View</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`relative h-9 w-9 rounded-full  ${viewMode === "explore" ? "bg-[#f1f1f1]" : "bg-white"} hover:bg-[#cecece]`}
                                    onClick={() => setViewMode("explore")}
                                >
                                    <MdOutlineTravelExplore className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Explore View</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                {/* Search Bar & Filters (Only in Explore Mode) */}
                {viewMode === "explore" && (
                    <div className="relative">
                        <div className="absolute flex items-center gap-2 rounded-full bg-white p-1 px-2 shadow-md">
                            {/* Search Input */}
                            <div className="flex items-center">
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearchTrigger()}
                                    className="w-32 border-none bg-transparent pl-1 outline-none focus:ring-0 sm:w-48"
                                />
                                {searchQuery && (
                                    <Button
                                        onClick={handleClearSearch}
                                        size="sm"
                                        variant="ghost"
                                        className="ml-1 p-1"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                                <Button
                                    onClick={handleSearchTrigger}
                                    size="sm"
                                    variant="ghost"
                                    disabled={isSearching || !searchQuery.trim()}
                                    aria-label="Search"
                                >
                                    {isSearching ? "..." : <Search className="h-4 w-4" />}
                                </Button>
                            </div>
                            {/* Category Filter */}
                            {!isMobile && (
                                <CategoryFilter
                                    categories={["circles", "projects", "users"]}
                                    categoryCounts={categoryCounts}
                                    selectedCategory={selectedCategory}
                                    onSelectionChange={setSelectedCategory}
                                    hasSearched={hasSearched}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Cards View */}
            {viewMode === "cards" && (
                <div
                    className={cn(
                        `absolute z-40 flex flex-col items-center justify-start overflow-visible transition-opacity duration-300`,
                        isMobile ? "w-full" : "w-[400px]",
                    )}
                    style={{
                        top: isMobile ? "80px" : "110px",
                        height: `calc(${windowHeight}px - 150px)`,
                    }}
                >
                    <div className="relative mb-4 flex w-full max-w-[400px] flex-col items-center">
                        {displayedSwipeCircles.length > 0 ? (
                            <div className="relative flex h-[500px] w-full max-w-[400px] items-center justify-center">
                                {currentIndex < displayedSwipeCircles.length && (
                                    <>
                                        <CircleSwipeCard
                                            key={displayedSwipeCircles[currentIndex]._id}
                                            circle={displayedSwipeCircles[currentIndex]}
                                            onSwiped={handleSwiped}
                                            zIndex={30}
                                        />
                                        {displayedSwipeCircles
                                            .slice(currentIndex + 1, currentIndex + 5)
                                            .map((circle, index) => (
                                                <div
                                                    key={circle._id}
                                                    className="absolute h-[450px] max-w-[400px] overflow-hidden rounded-xl border bg-white shadow-lg md:h-[560px]"
                                                    style={{
                                                        zIndex: 29 - index,
                                                        transform: `translateX(${
                                                            (index + 1) * 3
                                                        }px) translateY(${(index + 1) * -2}px)`,
                                                        opacity: 0.9,
                                                        pointerEvents: "none",
                                                        width: "calc(100% - 2rem)",
                                                    }}
                                                >
                                                    <div className="relative h-[220px] w-full overflow-hidden md:h-[300px]">
                                                        <Image
                                                            src={
                                                                circle.images?.[0]?.fileInfo?.url ??
                                                                "/images/default-cover.png"
                                                            }
                                                            alt=""
                                                            className="pointer-events-none object-cover"
                                                            fill
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                    </>
                                )}
                                {(currentIndex >= displayedSwipeCircles.length ||
                                    displayedSwipeCircles.length === 0) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex max-w-[400px] flex-col items-center gap-4 rounded-xl border bg-white p-8 shadow-lg"
                                    >
                                        <div className="text-xl font-semibold">You&apos;ve seen all circles!</div>
                                        <p className="text-center text-gray-600">
                                            Check back later for more recommendations
                                        </p>
                                        <div className="flex flex-row gap-2">
                                            <Button onClick={handleExplore} className="mt-4 gap-2">
                                                <MdOutlineTravelExplore className="h-4 w-4" /> Explore
                                            </Button>
                                            <Button onClick={goToFeed} className="mt-4 gap-2">
                                                <Home className="h-4 w-4" /> Go to feed
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="ml-2 flex max-w-[400px] flex-col items-center gap-4 rounded-xl border bg-white p-8 shadow-lg"
                            >
                                <div className="text-xl font-semibold">No circles to show!</div>
                                <p className="text-center text-gray-600">
                                    You might have seen, followed, or ignored all available circles.
                                </p>
                                <div className="flex flex-row gap-2">
                                    <Button onClick={handleExplore} className="mt-4 gap-2">
                                        <MdOutlineTravelExplore className="h-4 w-4" /> Explore
                                    </Button>
                                    <Button onClick={goToFeed} className="mt-4 gap-2">
                                        <Home className="h-4 w-4" /> Go to feed
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            )}

            {/* Desktop Search Results Panel */}
            {viewMode === "explore" && hasSearched && !isMobile && (
                <div className="formatted absolute left-4 top-20 z-40 max-h-[calc(100vh-120px)] w-[300px] overflow-y-auto rounded-lg bg-white shadow-lg">
                    <div className="formatted absolute left-4 top-20 z-40 max-h-[calc(100vh-120px)] w-[300px] overflow-y-auto rounded-lg bg-white shadow-lg">
                        <div className="p-4">
                            <h3 className="mb-2 font-semibold">Search Results</h3>
                            {isSearching && <p>Loading...</p>}
                            {!isSearching &&
                                allSearchResults.length > 0 &&
                                filteredSearchResults.length === 0 &&
                                selectedCategory && (
                                    <p className="text-sm text-gray-500">
                                        No results found for category &quot;{selectedCategory}&quot;.
                                    </p>
                                )}
                            {!isSearching && allSearchResults.length === 0 && hasSearched && (
                                <p className="text-sm text-gray-500">No results found for &quot;{searchQuery}&quot;.</p>
                            )}
                        </div>
                        {!isSearching && displayedContent.length > 0 && (
                            <ul className="space-y-2">
                                {/* Filter displayedContent to only include CircleLike items before mapping */}
                                {displayedContent
                                    .filter(
                                        (
                                            item,
                                        ): item is Circle | MemberDisplay => // Type guard to filter out PostDisplay
                                            item.circleType === "user" ||
                                            item.circleType === "circle" ||
                                            item.circleType === "project" ||
                                            !item.circleType, // Handle cases where circleType might be undefined but it's still CircleLike
                                    )
                                    .map((item) => (
                                        <li
                                            key={item._id} // Use MongoDB _id
                                            className="flex cursor-pointer items-center gap-2 rounded pb-2 pl-3 pt-1 hover:bg-gray-100"
                                            onClick={(e) => {
                                                // Zoom map
                                                if (item.location?.lngLat) {
                                                    // Cast item to any for handleSetZoomContent call site
                                                    handleSetZoomContent(item as any);
                                                }
                                                // Open preview or navigate
                                                if (isMobile) {
                                                    return; // no preview
                                                } else {
                                                    // Open preview panel
                                                    // Cast content to any to resolve userGroups mismatch from MemberDisplay
                                                    const contentPreviewData: ContentPreviewData = {
                                                        type: (item.circleType || "circle") as any, // Cast type as well for safety
                                                        content: item as any,
                                                    };
                                                    setContentPreview((prev) =>
                                                        prev?.content?._id === item._id
                                                            ? undefined
                                                            : contentPreviewData,
                                                    );
                                                    e.stopPropagation(); // Prevent potential map click through
                                                }
                                            }}
                                            title={
                                                item.location?.lngLat
                                                    ? "Click to focus map and view details"
                                                    : "Click to view details (no location)"
                                            }
                                        >
                                            <div className="relative">
                                                {/* Pass item directly, CirclePicture now accepts CircleLike */}
                                                <CirclePicture circle={item} size="40px" showTypeIndicator={true} />
                                            </div>
                                            <div className="relative flex-1 overflow-hidden pl-2">
                                                <div className="truncate p-0 text-sm font-medium">
                                                    {/* Handle name based on type */}
                                                    {"name" in item && item.name ? item.name : "Post"}
                                                </div>
                                                <div className="mt-1 line-clamp-2 p-0 text-xs text-gray-500">
                                                    {/* Handle description/content/mission based on type */}
                                                    {"description" in item
                                                        ? item.description ??
                                                          ("mission" in item ? item.mission : "") ??
                                                          ""
                                                        : "content" in item && typeof item.content === "string"
                                                          ? item.content.substring(0, 70) +
                                                            (item.content.length > 70 ? "..." : "")
                                                          : ""}
                                                </div>
                                                {/* Ensure metrics check is robust */}
                                                {"metrics" in item && item.metrics && (
                                                    <div className="flex flex-row pt-1">
                                                        <Indicators
                                                            className="pointer-events-none"
                                                            metrics={item.metrics}
                                                        />
                                                        <div className="flex-1" />
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Mobile Explore Drawer */}
            {viewMode === "explore" && isMobile && windowHeight > 0 && (
                <ResizingDrawer
                    snapPoints={snapPoints}
                    initialSnapPointIndex={SNAP_INDEX_PEEK} // Start at peek
                    activeSnapIndex={drawerSnapIndex} // Control snap index externally
                    moveThreshold={60} // Adjust as needed
                    // Optional: Get notified when drawer snaps internally
                    // onSnapChange={(index) => setDrawerSnapIndex(index)}
                >
                    {/* Requirement 4: Conditional Rendering inside Drawer */}
                    {contentPreview ? (
                        // --- Content Preview View ---
                        <div className="flex h-full flex-col">
                            <div className="flex items-center border-b px-0 py-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setContentPreview(undefined)} // Back button clears preview
                                    className="mr-2"
                                >
                                    <ArrowLeft className="mr-1 h-4 w-4" /> Back to List
                                </Button>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {/* Render the actual preview component */}
                                <ContentPreview />
                            </div>
                        </div>
                    ) : (
                        // --- List View (Default / Search Results) ---
                        <div className="flex-1 rounded-t-[10px] bg-white pt-0">
                            {" "}
                            {/* Ensure flex-1 is here if needed */}
                            <div className="mx-0 px-4 pb-4">
                                {/* Loading and No Results Messages */}
                                {isSearching && <p className="py-4 text-center">Loading...</p>}
                                {!isSearching && drawerListData.length === 0 && (
                                    <p className="py-4 text-center text-sm text-gray-500">
                                        {hasSearched ? `No results found for "${searchQuery}".` : "No circles found."}
                                    </p>
                                )}

                                {/* Results List */}
                                {!isSearching && drawerListData.length > 0 && (
                                    <ul className="space-y-2">
                                        {/* Requirement 2: Use drawerListData */}
                                        {drawerListData.map((item) => (
                                            <li
                                                key={item._id}
                                                className="flex cursor-pointer items-center gap-2 rounded pb-2 pt-1 hover:bg-gray-100"
                                                onClick={() => {
                                                    // Requirement 3: Set contentPreview on click
                                                    const previewData: ContentPreviewData = {
                                                        type: (item.circleType || "circle") as any,
                                                        content: item as any,
                                                    };
                                                    setContentPreview(previewData);

                                                    // Also zoom map if location exists
                                                    if (item.location?.lngLat) {
                                                        handleSetZoomContent(item);
                                                    }
                                                }}
                                                title={
                                                    item.location?.lngLat
                                                        ? "Click to focus map and view details"
                                                        : "Click to view details"
                                                }
                                            >
                                                {/* List Item Content (remains the same) */}
                                                <div className="relative">
                                                    <CirclePicture circle={item} size="60px" showTypeIndicator={true} />
                                                </div>
                                                <div className="relative flex-1 overflow-hidden pl-4">
                                                    <div className="truncate p-0 text-xl font-medium">
                                                        {item.name || "Untitled"}
                                                    </div>
                                                    <div className="text-md mt-1 line-clamp-2 p-0 text-gray-500">
                                                        {item.description || item.mission || ""}
                                                    </div>
                                                    {item.metrics && (
                                                        <div className="flex flex-row pt-1">
                                                            <Indicators
                                                                className="pointer-events-none"
                                                                metrics={item.metrics}
                                                            />
                                                            <div className="flex-1" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="relative">
                                                    {/* <ChevronRight className="h-4 w-4" /> */}
                                                    <HiChevronRight className="h-4 w-4" />
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </ResizingDrawer>
            )}

            {/* Swipe instructions popup */}
            {showSwipeInstructions && viewMode === "cards" && (
                // ... (no changes needed here) ...
                <motion.div
                    className="absolute bottom-0 left-0 right-0 top-0 z-[60] flex items-center justify-center bg-black/50" // Increased z-index
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="max-w-[350px] rounded-lg bg-white p-6 text-center shadow-xl">
                        <h3 className="mb-3 text-xl font-semibold">How to Discover</h3>
                        {/* Hand animation */}
                        <div className="relative mb-6 h-20 w-full">
                            <motion.div
                                className="absolute flex h-full w-full items-center justify-center"
                                animate={{ x: [0, -40, 0, 40, 0] }}
                                transition={{ repeat: Infinity, duration: 4, times: [0, 0.25, 0.5, 0.75, 1] }}
                            >
                                <Hand className="h-16 w-16 text-gray-600" />
                            </motion.div>
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-red-500">
                                Ignore
                            </div>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-green-500">
                                Follow
                            </div>
                        </div>
                        <p className="mb-6 text-gray-600">Swipe card right to follow, left to ignore.</p>
                        <Button onClick={handleGotIt} className="w-full">
                            Got it
                        </Button>
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default MapExplorer;

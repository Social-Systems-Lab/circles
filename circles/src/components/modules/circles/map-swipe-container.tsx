// map-swipe-container.tsx
"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Circle, WithMetric, Content, ContentPreviewData, MemberDisplay } from "@/models/models"; // Added MemberDisplay import
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import { motion } from "framer-motion";
import CircleSwipeCard from "./circle-swipe-card";
import { MapDisplay } from "@/components/map/map";
import { Button } from "@/components/ui/button";
import { RefreshCw, Hand, Home, Search, X } from "lucide-react"; // Added X icon
import { MdOutlineTravelExplore } from "react-icons/md"; // Added Explore icon
import { HiMiniSquare2Stack } from "react-icons/hi2"; // Added Card Stack icon
import { useAtom } from "jotai";
import { userAtom, zoomContentAtom, displayedContentAtom, contentPreviewAtom } from "@/lib/data/atoms"; // Added displayedContentAtom and contentPreviewAtom
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CirclePicture } from "./circle-picture"; // Correct named import
import { completeSwipeOnboardingAction } from "./swipe-actions";
import { useRouter } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Re-add ToggleGroup imports
import { searchContentAction } from "../search/actions"; // Import server action
import CategoryFilter from "../search/category-filter"; // Import CategoryFilter
import Indicators from "@/components/utils/indicators";
import CustomDrawer from "@/components/ui/custom-drawer"; // Import CustomDrawer

// Helper function to map enriched Content or Circle to Content type for Jotai atoms
// Primarily used for setting zoomContent
const mapItemToContent = (item: WithMetric<Content> | Circle | undefined): Content | null => {
    if (!item) return null;

    // If it's already enriched content (WithMetric<Content>)
    if ("metrics" in item && item.metrics) {
        // Ensure the returned object matches the Content type definition
        // Keep relevant metrics if needed by downstream components (like MapDisplay or ContentDisplayWrapper)
        const { metrics, ...contentData } = item;
        return {
            ...contentData,
            metrics: {
                similarity: metrics.similarity,
                searchRank: metrics.searchRank,
                // Add other metrics if needed by consumers
            },
        } as Content; // Cast might be needed depending on exact Content definition vs. WithMetric<Content>
    }

    // If it's a plain Circle (e.g., from initial swipe cards)
    if ("circleType" in item || "type" in item) {
        // It's likely a Circle or PostDisplay etc. (already compatible with Content union)
        // Add default/empty metrics if needed by consumers
        return { ...item, metrics: {} } as Content;
    }

    console.warn("Unmappable item type in mapItemToContent:", item);
    return null;
};

interface MapSwipeContainerProps {
    allDiscoverableCircles: WithMetric<Circle>[]; // Renamed prop for clarity
    mapboxKey: string;
}

type ViewMode = "cards" | "explore";

export const MapSwipeContainer: React.FC<MapSwipeContainerProps> = ({ allDiscoverableCircles, mapboxKey }) => {
    // Existing state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [user, setUser] = useAtom(userAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const [displayedContent, setDisplayedContent] = useAtom(displayedContentAtom); // Atom for map markers
    const isMobile = useIsMobile();
    const { windowWidth, windowHeight } = useWindowDimensions();
    const router = useRouter();

    // New state for search and view mode
    const [viewMode, setViewMode] = useState<ViewMode>("explore");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // State for single selected category
    const [allSearchResults, setAllSearchResults] = useState<WithMetric<Circle>[]>([]); // Store ALL results from backend
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false); // Track if a search has been initiated
    const [isDrawerOpen, setIsDrawerOpen] = useState(false); // State to control drawer visibility
    const [, setContentPreview] = useAtom(contentPreviewAtom); // Atom for content preview panel

    // Calculate snap points unconditionally
    const snapPoints = useMemo(() => [370, windowHeight * 0.3 - 72, windowHeight * 0.8 - 72], [windowHeight]);

    // Memoize the filtered initial circles for swiping
    const displayedSwipeCircles = useMemo(() => {
        if (!user) return [];
        const userFollowedIds = (user.memberships || []).map((m) => m.circleId);
        const userPendingIds = (user.pendingRequests || []).map((r) => r.circleId);
        const userIgnoredIds = user.ignoredCircles || [];
        console.log("Filtering discoverable circles for swipe. Count:", allDiscoverableCircles.length);
        const filtered = allDiscoverableCircles.filter(
            (circle) =>
                !userFollowedIds.includes(circle._id) &&
                !userPendingIds.includes(circle._id) &&
                !userIgnoredIds.includes(circle._id),
        );
        console.log("Filtered swipe circles count:", filtered.length);
        return filtered;
    }, [allDiscoverableCircles, user]); // Dependencies: allDiscoverableCircles and user

    // Reset index when swipe circles change
    useEffect(() => {
        setCurrentIndex(0);
    }, [displayedSwipeCircles]);

    const handleSwiped = useCallback((circle: Circle, direction: "left" | "right") => {
        setCurrentIndex((prev) => prev + 1);
    }, []);

    // Helper to set zoom content with mapping
    // Helper to set zoom content using the simplified mapping function
    const handleSetZoomContent = useCallback(
        (item: WithMetric<Circle> | Circle | undefined) => {
            // Changed type here
            if (!item) {
                setZoomContent(undefined);
                return;
            }
            // Use the unified mapping function
            const mappedItem = mapItemToContent(item);
            if (mappedItem) {
                setZoomContent(mappedItem);
            } else {
                console.warn("Could not map item for zooming:", item);
                setZoomContent(undefined); // Clear zoom if mapping fails
            }
        },
        [setZoomContent],
    );

    // Update map zoom for the current swipe card
    useEffect(() => {
        if (viewMode === "cards" && currentIndex < displayedSwipeCircles.length) {
            const currentCircle = displayedSwipeCircles[currentIndex];
            if (currentCircle?.location?.lngLat) {
                setTimeout(() => handleSetZoomContent(currentCircle), 100); // Use helper
            }
        }
    }, [currentIndex, displayedSwipeCircles, viewMode, handleSetZoomContent]); // Use helper

    // --- Search Logic ---
    const handleSearchTrigger = useCallback(async () => {
        // Always search for all relevant types (circles, projects, users)
        const searchCategoriesForBackend = ["circles", "projects", "users"];
        if (!searchQuery.trim()) {
            setAllSearchResults([]);
            setDisplayedContent([]); // Clear map
            setHasSearched(false); // Reset search initiated flag
            return;
        }
        setIsSearching(true);
        setHasSearched(true); // Mark that a search has been initiated
        setAllSearchResults([]); // Clear previous results immediately
        setDisplayedContent([]); // Clear map immediately
        try {
            console.log(
                "Calling searchContentAction with query:",
                searchQuery,
                "categories:",
                searchCategoriesForBackend,
            );
            // Call the server action - it should ignore categories and search all 'circles' VDB
            const results = await searchContentAction(searchQuery, searchCategoriesForBackend);
            console.log("Received ALL enriched results from server action:", results.length);
            setAllSearchResults(results); // Store all results
        } catch (error) {
            console.error("Search action failed:", error);
            setAllSearchResults([]); // Clear results on error
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, setDisplayedContent]); // Removed selectedCategories dependency

    // Memoize filtered results for display based on selectedCategory
    const filteredSearchResults = useMemo(() => {
        if (!selectedCategory) {
            return allSearchResults; // Show all if no category is selected
        }
        // Map UI category name (plural) to circleType (singular)
        const typeToFilter =
            selectedCategory === "circles" ? "circle" : selectedCategory === "projects" ? "project" : "user";
        return allSearchResults.filter((result) => result.circleType === typeToFilter);
    }, [allSearchResults, selectedCategory]);

    // Calculate category counts from ALL search results
    const categoryCounts = useMemo(() => {
        const counts: { [key: string]: number } = { circles: 0, projects: 0, users: 0 };
        allSearchResults.forEach((result) => {
            if (result.circleType === "circle") counts.circles++;
            else if (result.circleType === "project") counts.projects++;
            else if (result.circleType === "user") counts.users++;
        });
        return counts;
    }, [allSearchResults]);

    // Add the clear search handler
    // Helper function to filter circles by category
    const filterCirclesByCategory = useCallback((circles: WithMetric<Circle>[], category: string | null) => {
        if (!category) return circles;
        const typeToFilter = category === "circles" ? "circle" : category === "projects" ? "project" : "user";
        return circles.filter((c) => c.circleType === typeToFilter);
    }, []);

    // Add the clear search handler
    const handleClearSearch = useCallback(() => {
        setSearchQuery("");
        setAllSearchResults([]); // Clear all results
        setHasSearched(false); // Reset search state
        setSelectedCategory(null); // Reset category filter
        // Reset map to show all discoverable circles (filtered by the now null category)
        const resetMapData = filterCirclesByCategory(allDiscoverableCircles, null)
            .map((circle) => mapItemToContent(circle))
            .filter((c): c is Content => c !== null);
        setDisplayedContent(resetMapData);
        console.log("Search cleared, resetting map to all discoverable circles:", resetMapData.length);
    }, [setDisplayedContent, allDiscoverableCircles, filterCirclesByCategory]);

    // --- End Search Logic ---

    // Handle switching TO cards view
    useEffect(() => {
        if (viewMode === "cards") {
            // When switching to cards, show the current swipe circle on map
            if (currentIndex < displayedSwipeCircles.length) {
                const currentCircle = displayedSwipeCircles[currentIndex];
                console.log("Switching to cards view, showing current card on map:", currentCircle?._id);
                const cardMapData = [currentCircle]
                    .filter(Boolean)
                    .map(mapItemToContent)
                    .filter((c): c is Content => c !== null);
                setDisplayedContent(cardMapData); // Show only current card marker
                if (currentCircle?.location?.lngLat) {
                    setTimeout(() => handleSetZoomContent(currentCircle), 100); // Use helper
                }
            } else {
                console.log("Switching to cards view, no cards left, clearing map.");
                setDisplayedContent([]); // Clear map if no cards left
            }
        }
        // Logic for explore view map updates is handled in the effect below
    }, [viewMode, displayedSwipeCircles, currentIndex, handleSetZoomContent, setDisplayedContent]); // Dependencies for cards view logic

    // Update map markers when in Explore mode based on search state and category
    useEffect(() => {
        if (viewMode === "explore") {
            let mapData: Content[] = [];
            if (hasSearched) {
                // If a search is active, use filtered search results
                console.log(
                    "Explore View: Updating map with FILTERED search results (Category:",
                    selectedCategory || "All",
                    ") Count:",
                    filteredSearchResults.length,
                );
                mapData = filteredSearchResults
                    .map((circle) => mapItemToContent(circle))
                    .filter((c): c is Content => c !== null);
            } else {
                // If no search is active, use all discoverable circles filtered by category
                console.log(
                    "Explore View: Updating map with discoverable circles (Category:",
                    selectedCategory || "All",
                    ")",
                );
                mapData = filterCirclesByCategory(allDiscoverableCircles, selectedCategory)
                    .map((circle) => mapItemToContent(circle))
                    .filter((c): c is Content => c !== null);
                console.log("Discoverable map data count:", mapData.length);
            }
            setDisplayedContent(mapData);
        }
        // This effect runs whenever the inputs determining explore map content change
    }, [
        viewMode,
        hasSearched,
        filteredSearchResults,
        allDiscoverableCircles,
        selectedCategory,
        filterCirclesByCategory,
        setDisplayedContent,
    ]);

    // Effect to control drawer open state based on search status and view mode on mobile
    useEffect(() => {
        if (viewMode === "explore" && isMobile) {
            setIsDrawerOpen(true);
        } else {
            setIsDrawerOpen(false); // Close drawer if not in explore mode, not mobile, or search cleared
        }
    }, [viewMode, isMobile]);

    // Custom handler for drawer open change to prevent closing while search is active
    const handleDrawerOpenChange = useCallback(
        (open: boolean) => {
            // Prevent closing via onOpenChange if search is still active
            if (!open && hasSearched) {
                return;
            }
            // Allow closing if search is not active, or allow opening
            setIsDrawerOpen(open);
        },
        [hasSearched], // Only depends on hasSearched
    );

    const handleRefresh = () => {
        // Consider resetting state instead of full reload if possible
        window.location.reload();
    };

    const goToFeed = () => {
        router.push("/foryou");
    };

    // Initial focus on first swipe card when loaded in 'cards' mode
    useEffect(() => {
        if (viewMode === "cards" && displayedSwipeCircles.length > 0 && currentIndex === 0) {
            const firstCircle = displayedSwipeCircles[0];
            console.log("Initial load in cards mode, focusing on first card:", firstCircle?._id);
            setDisplayedContent([firstCircle].filter(Boolean)); // Show only first card marker initially
            if (firstCircle?.location?.lngLat) {
                setTimeout(() => handleSetZoomContent(firstCircle), 300); // Use helper
            }
        }
    }, [displayedSwipeCircles, viewMode, handleSetZoomContent, setDisplayedContent, currentIndex]); // Use helper, Removed currentIndex dependency

    // Fixes hydration errors & Onboarding
    const [isMounted, setIsMounted] = useState(false);
    const [showSwipeInstructions, setShowSwipeInstructions] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Show swipe instructions only in 'cards' mode and if not completed
        if (
            viewMode === "cards" &&
            user &&
            displayedSwipeCircles.length > 0 &&
            (!user.completedOnboardingSteps || !user.completedOnboardingSteps.includes("swipe"))
        ) {
            setShowSwipeInstructions(true);
        } else {
            setShowSwipeInstructions(false); // Hide if not in cards mode or already completed
        }
    }, [user, displayedSwipeCircles, viewMode]); // Added viewMode dependency

    const handleGotIt = async () => {
        setShowSwipeInstructions(false);
        if (user) {
            await completeSwipeOnboardingAction();
            setUser((prevUser) => ({
                ...prevUser!,
                completedOnboardingSteps: [...(prevUser!.completedOnboardingSteps || []), "swipe"],
            }));
        }
    };

    if (!isMounted) {
        return null;
    }

    return (
        <div className="relative flex w-full flex-row overflow-hidden md:h-full">
            {/* Map container */}
            {mapboxKey && (
                <div className="relative flex-1">
                    <MapDisplay mapboxKey={mapboxKey} />
                </div>
            )}

            {/* Top Bar Controls */}
            <div className={`absolute ${isMobile ? "flex-col" : "flex-row"} left-4 top-4 z-50 flex gap-2`}>
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
                                {/* <Search className="ml-1 mr-1 h-5 w-5 text-gray-500" /> */}
                                <input
                                    type="text"
                                    placeholder="Search..." // Shortened placeholder
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearchTrigger()}
                                    className="w-32 border-none bg-transparent pl-1 outline-none focus:ring-0 sm:w-48" // Responsive width
                                />
                                {/* Clear Search Button */}
                                {searchQuery && (
                                    <Button
                                        onClick={handleClearSearch} // Use the handler
                                        size="sm"
                                        variant="ghost"
                                        className="ml-1 p-1" // Added padding for easier clicking
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                                {/* Search Trigger Button */}
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
                            {/* Category Filter - Use updated props */}
                            {!isMobile && (
                                <CategoryFilter
                                    categories={["circles", "projects", "users"]} // Only relevant categories
                                    categoryCounts={categoryCounts} // Pass calculated counts
                                    selectedCategory={selectedCategory} // Pass single selected category state
                                    onSelectionChange={setSelectedCategory} // Pass state setter
                                    hasSearched={hasSearched}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Conditional Rendering based on viewMode */}
            {viewMode === "cards" && (
                // Cards container
                <div
                    className={cn(
                        `absolute z-40 flex flex-col items-center justify-start overflow-visible transition-opacity duration-300`,
                        isMobile ? "w-full" : "w-[400px]",
                    )}
                    style={{
                        top: isMobile ? "80px" : "110px", // Adjusted top position slightly
                        height: `calc(${windowHeight}px - 150px)`,
                    }}
                >
                    <div className="relative mb-4 flex w-full max-w-[400px] flex-col items-center">
                        {displayedSwipeCircles.length > 0 ? (
                            <div className="relative flex h-[500px] w-full max-w-[400px] items-center justify-center">
                                {currentIndex < displayedSwipeCircles.length && (
                                    <>
                                        {/* Current card */}
                                        <CircleSwipeCard
                                            key={displayedSwipeCircles[currentIndex]._id}
                                            circle={displayedSwipeCircles[currentIndex]}
                                            onSwiped={handleSwiped}
                                            zIndex={30}
                                        />
                                        {/* Stacked cards */}
                                        {displayedSwipeCircles
                                            .slice(currentIndex + 1, currentIndex + 5)
                                            .map((circle, index) => (
                                                <div
                                                    key={circle._id}
                                                    className="absolute h-[450px] max-w-[400px] overflow-hidden rounded-xl border bg-white shadow-lg md:h-[560px]"
                                                    style={{
                                                        zIndex: 29 - index,
                                                        transform: `translateX(${(index + 1) * 3}px) translateY(${(index + 1) * -2}px)`,
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
                                {/* End of cards message */}
                                {(currentIndex >= displayedSwipeCircles.length ||
                                    displayedSwipeCircles.length === 0) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex max-w-[400px] flex-col items-center gap-4 rounded-xl border bg-white p-8 shadow-lg"
                                    >
                                        <div className="text-xl font-semibold">You've seen all circles!</div>{" "}
                                        {/* Fixed apostrophe escape */}
                                        <p className="text-center text-gray-600">
                                            Check back later for more recommendations
                                        </p>
                                        <div className="flex flex-row gap-2">
                                            <Button onClick={handleRefresh} className="mt-4 gap-2">
                                                <RefreshCw className="h-4 w-4" /> Refresh
                                            </Button>
                                            <Button onClick={goToFeed} className="mt-4 gap-2">
                                                <Home className="h-4 w-4" /> Go to feed
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        ) : (
                            // No cards available message
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
                                    <Button onClick={handleRefresh} className="mt-4 gap-2">
                                        <RefreshCw className="h-4 w-4" /> Refresh
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

            {/* Search Results Panel (Desktop - Only in Explore Mode and after search initiated) */}
            {viewMode === "explore" && hasSearched && !isMobile && (
                <div className="formatted absolute left-4 top-20 z-40 max-h-[calc(100vh-120px)] w-[300px] overflow-y-auto rounded-lg bg-white shadow-lg">
                    <div className="p-4">
                        <h3 className="mb-2 font-semibold">Search Results</h3>
                        {isSearching && <p>Loading...</p>}
                        {!isSearching &&
                            allSearchResults.length > 0 &&
                            filteredSearchResults.length === 0 &&
                            selectedCategory && (
                                <p className="text-sm text-gray-500">
                                    No results found for category "{selectedCategory}".
                                </p>
                            )}
                        {!isSearching && allSearchResults.length === 0 && hasSearched && (
                            <p className="text-sm text-gray-500">No results found for "{searchQuery}".</p>
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
                                                    prev?.content?._id === item._id ? undefined : contentPreviewData,
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
                                                    ? item.description ?? ("mission" in item ? item.mission : "") ?? ""
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
            )}

            {/* Search Results Drawer (Mobile - Only in Explore Mode) */}
            {viewMode === "explore" && isMobile && (
                <CustomDrawer
                    open={isDrawerOpen}
                    onOpenChange={handleDrawerOpenChange} // Your existing handler
                    snapPoints={snapPoints} // Pass the calculated snap points
                    initialSnapPointIndex={0} // Open initially to the first snap point
                    snapThreshold={160}
                    modal={true} // Keep the overlay
                    // fadeFromIndex={0} // Overlay fades from the first snap point (default)
                    // animationConfig={{ tension: 210, friction: 20 }} // Optional custom spring
                >
                    <div className="flex-1 rounded-t-[10px] bg-white pt-0">
                        <div className="mx-0 px-4 pb-4">
                            <div className="hidden">
                                <h2 className="formatted mb-4 font-medium">Search Results</h2>
                            </div>
                            {/* Loading and No Results Messages */}
                            {isSearching && <p>Loading...</p>}
                            {!isSearching &&
                                allSearchResults.length > 0 &&
                                filteredSearchResults.length === 0 &&
                                selectedCategory && (
                                    <p className="text-sm text-gray-500">
                                        No results found for category "{selectedCategory}".
                                    </p>
                                )}
                            {!isSearching && allSearchResults.length === 0 && hasSearched && (
                                <p className="text-sm text-gray-500">No results found for "{searchQuery}".</p>
                            )}
                            {/* Results List */}
                            {!isSearching && filteredSearchResults.length > 0 && (
                                <ul className="space-y-2">
                                    {/* Filter filteredSearchResults to only include CircleLike items before mapping */}
                                    {filteredSearchResults
                                        .filter(
                                            (
                                                item, // Removed incorrect type predicate
                                            ) =>
                                                item.circleType === "user" ||
                                                item.circleType === "circle" ||
                                                item.circleType === "project" ||
                                                !item.circleType,
                                        )
                                        .map((item) => (
                                            <li
                                                key={item._id} // Use MongoDB _id
                                                className="flex cursor-pointer items-center gap-2 rounded pb-2 pt-1 hover:bg-gray-100"
                                                onClick={(e) => {
                                                    // Zoom map
                                                    if (item.location?.lngLat) {
                                                        handleSetZoomContent(item);
                                                    }
                                                    // Mobile: No preview panel, just zoom
                                                }}
                                                title={
                                                    item.location?.lngLat
                                                        ? "Click to focus map"
                                                        : "No location available"
                                                }
                                            >
                                                <div className="relative">
                                                    {/* Pass item directly, CirclePicture now accepts CircleLike */}
                                                    <CirclePicture circle={item} size="60px" showTypeIndicator={true} />
                                                </div>
                                                <div className="relative flex-1 overflow-hidden pl-4">
                                                    <div className="truncate p-0 text-xl font-medium">
                                                        {item.name || "Untitled"}
                                                    </div>
                                                    <div className="text-md mt-1 line-clamp-2 p-0 text-gray-500">
                                                        {item.description || item.mission || ""}
                                                    </div>
                                                    {/* Conditionally render Indicators based on item.metrics */}
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
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </CustomDrawer>
            )}

            {/* Swipe instructions popup (only in cards mode) */}
            {showSwipeInstructions && viewMode === "cards" && (
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

export default MapSwipeContainer;

"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Circle, WithMetric, Content, ContentPreviewData } from "@/models/models"; // Content is needed for atoms
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
    initialCircles: WithMetric<Circle>[]; // Renamed prop
    mapboxKey: string;
}

type ViewMode = "cards" | "explore";

export const MapSwipeContainer: React.FC<MapSwipeContainerProps> = ({ initialCircles, mapboxKey }) => {
    // Existing state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [user, setUser] = useAtom(userAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const [, setDisplayedContent] = useAtom(displayedContentAtom); // Atom for map markers
    const isMobile = useIsMobile();
    const { windowWidth, windowHeight } = useWindowDimensions();
    const router = useRouter();

    // New state for search and view mode
    const [viewMode, setViewMode] = useState<ViewMode>("cards");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // State for single selected category
    const [allSearchResults, setAllSearchResults] = useState<WithMetric<Circle>[]>([]); // Store ALL results from backend
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false); // Track if a search has been initiated
    const [, setContentPreview] = useAtom(contentPreviewAtom); // Atom for content preview panel

    // Memoize the filtered initial circles for swiping
    const displayedSwipeCircles = useMemo(() => {
        if (!user) return [];
        const userFollowedIds = (user.memberships || []).map((m) => m.circleId);
        const userPendingIds = (user.pendingRequests || []).map((r) => r.circleId);
        const userIgnoredIds = user.ignoredCircles || [];
        console.log("Filtering initial circles. Count:", initialCircles.length);
        const filtered = initialCircles.filter(
            (circle) =>
                !userFollowedIds.includes(circle._id) &&
                !userPendingIds.includes(circle._id) &&
                !userIgnoredIds.includes(circle._id),
        );
        console.log("Filtered swipe circles count:", filtered.length);
        return filtered;
    }, [initialCircles, user]); // Dependencies: initialCircles and user

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
    const handleClearSearch = useCallback(() => {
        setSearchQuery("");
        setAllSearchResults([]); // Clear all results
        setDisplayedContent([]); // Clear map markers as well
        setHasSearched(false); // Reset search state
        setSelectedCategory(null); // Reset category filter
    }, [setDisplayedContent]);

    // Update map markers based on FILTERED search results (only in explore mode)
    useEffect(() => {
        if (viewMode === "explore") {
            console.log("Updating map display with FILTERED search results:", filteredSearchResults.length);
            const mapData = filteredSearchResults
                .map((circle) => mapItemToContent(circle))
                .filter((c): c is Content => c !== null);
            setDisplayedContent(mapData); // Update atom with mapped data
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredSearchResults, viewMode]); // Depend on filtered results now

    // Handle view mode changes
    useEffect(() => {
        console.log("View mode changed to:", viewMode);
        if (viewMode === "cards") {
            // When switching to cards, show the current swipe circle on map
            if (currentIndex < displayedSwipeCircles.length) {
                const currentCircle = displayedSwipeCircles[currentIndex];
                console.log("Switching to cards view, showing current card on map:", currentCircle?._id);
                setDisplayedContent([currentCircle].filter(Boolean)); // Show only current card marker
                if (currentCircle?.location?.lngLat) {
                    setTimeout(() => handleSetZoomContent(currentCircle), 100); // Use helper
                }
            } else {
                console.log("Switching to cards view, no cards left, clearing map.");
                setDisplayedContent([]); // Clear map if no cards left
            }
            setAllSearchResults([]); // Fix typo: Clear ALL search results state
        } else {
            // When switching to explore, update map with current search results
            console.log(
                "Switching to explore view, showing FILTERED search results on map:",
                filteredSearchResults.length,
            );
            // Update map with filtered results
            const mapData = filteredSearchResults
                .map((circle) => mapItemToContent(circle))
                .filter((c): c is Content => c !== null);
            setDisplayedContent(mapData);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode]); // Intentionally simplified: Only run when viewMode changes. Read other state inside.

    // --- End Search Logic ---

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
        <div className="relative flex h-full w-full flex-row overflow-hidden">
            {/* Map container */}
            {mapboxKey && (
                <div className="relative flex-1">
                    <MapDisplay mapboxKey={mapboxKey} />
                </div>
            )}

            {/* Top Bar Controls */}
            <div className="absolute left-4 top-4 z-50 flex flex-wrap items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex flex-row gap-1 rounded-full bg-white p-[4px] shadow-md">
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
                    <div className="flex flex-wrap items-center gap-2 rounded-full bg-white p-1 px-2 shadow-md">
                        {/* Search Input */}
                        <div className="flex items-center">
                            <Search className="ml-1 mr-1 h-5 w-5 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search..." // Shortened placeholder
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearchTrigger()}
                                className="w-32 border-none bg-transparent outline-none focus:ring-0 sm:w-48" // Responsive width
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
                        <CategoryFilter
                            categories={["circles", "projects", "users"]} // Only relevant categories
                            categoryCounts={categoryCounts} // Pass calculated counts
                            selectedCategory={selectedCategory} // Pass single selected category state
                            onSelectionChange={setSelectedCategory} // Pass state setter
                            hasSearched={hasSearched}
                        />
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
                                        <div className="text-xl font-semibold">You&apos;ve seen all circles!</div>{" "}
                                        {/* Re-escaped ' */}
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

            {/* Search Results Panel (Only in Explore Mode and after search initiated) */}
            {viewMode === "explore" && hasSearched && (
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
                    {!isSearching && filteredSearchResults.length > 0 && (
                        <ul className="space-y-2">
                            {filteredSearchResults.map((item) => (
                                <li
                                    key={item._id} // Use MongoDB _id
                                    className="flex cursor-pointer items-start gap-2 rounded pb-2 pl-3 pt-1 hover:bg-gray-100"
                                    onClick={(e) => {
                                        // Zoom map
                                        if (item.location?.lngLat) {
                                            handleSetZoomContent(item);
                                        }
                                        // Open preview or navigate
                                        if (isMobile) {
                                            // Determine path based on type
                                            const path =
                                                item.circleType === "user"
                                                    ? `/users/${item.handle}` // Assuming user profile path
                                                    : `/circles/${item.handle}`; // Circle/Project path
                                            router.push(path);
                                        } else {
                                            // Open preview panel
                                            const contentPreviewData: ContentPreviewData = {
                                                type: item.circleType || "circle", // Use actual type
                                                content: item, // Pass the full item data
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
                                        <CirclePicture circle={item} size="40px" showTypeIndicator={true} />
                                    </div>
                                    <div className="flex-1 overflow-hidden pl-2">
                                        <div className="truncate p-0 text-sm font-medium">
                                            {item.name || "Untitled"}
                                        </div>
                                        <div className="mt-1 line-clamp-2 p-0 text-xs text-gray-500">
                                            {item.description || item.mission || ""}
                                        </div>
                                        {!item.location?.lngLat && (
                                            <span className="ml-1 text-xs text-gray-400">(No location)</span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
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

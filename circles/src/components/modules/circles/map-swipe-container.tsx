"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Circle, WithMetric, Content } from "@/models/models"; // Added Content
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import { motion } from "framer-motion";
import CircleSwipeCard from "./circle-swipe-card";
import { MapDisplay } from "@/components/map/map";
import { Button } from "@/components/ui/button";
import { RefreshCw, Hand, Home, Search, LayoutGrid, MapPin } from "lucide-react"; // Updated icons
import { useAtom } from "jotai";
import { userAtom, zoomContentAtom, displayedContentAtom } from "@/lib/data/atoms"; // Added displayedContentAtom
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { completeSwipeOnboardingAction } from "./swipe-actions";
import { useRouter } from "next/navigation";
import { SearchResultItem } from "@/lib/data/vdb"; // Import search result type
import { searchContentAction } from "../search/actions"; // Import server action
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Import ToggleGroup
import CategoryFilter from "../search/category-filter"; // Import CategoryFilter
// Placeholder import for SearchResultsPanel (if needed later)
// import SearchResultsPanel from "../search/search-results-panel";

// Helper function to map SearchResultItem to Content type for Jotai atoms
const mapSearchResultToContent = (item: SearchResultItem): Content | null => {
    if (!item) return null;

    // Basic mapping structure - might need refinement based on exact Content definition needs
    const baseContent: Partial<Content> = {
        _id: item._id, // Assuming SearchResultItem._id is the MongoDB ObjectId string
        name: item.name,
        description: item.description,
        location: item.location
            ? {
                  // Map SearchResultItem location to Content location
                  lngLat: item.location.lngLat,
                  // Assuming precision/country/region/city aren't directly available in SearchResultItem payload
                  // We might need to fetch full Circle/Post data later if these are needed
                  precision: item.location.lngLat ? 10 : 0, // Example precision
                  city: item.location.name?.split(",")[0].trim(), // Crude extraction
              }
            : undefined,
        images: item.images,
        // Map metrics if available/needed
        metrics: {
            similarity: item.score,
        },
    };

    if (item.type === "post") {
        // Attempt to create a valid PostDisplay structure
        // Note: Many fields are missing from SearchResultItem and need placeholders or fetching
        return {
            ...baseContent,
            content: item.content,
            circleType: "post", // Required for PostDisplay union type
            author: item.author ? { _id: item.author._id, name: item.author.name } : ({} as Circle), // Placeholder/Partial
            createdAt: new Date(), // Placeholder
            feedId: "", // Placeholder - Needs actual data
            createdBy: item.author?._id || "", // Placeholder - Needs actual data
            comments: 0, // Default
            reactions: {}, // Default
            // Add other required fields from PostDisplay if necessary, with defaults/placeholders
        } as Content; // Cast needed due to potential missing fields
    } else if (item.type === "user" || item.type === "circle" || item.type === "project") {
        // Attempt to create a valid Circle structure
        return {
            ...baseContent,
            circleType: item.type, // 'user', 'circle', or 'project'
            // Map 'type' based on Content's Circle definition ('user' or 'organization')
            type: item.type === "user" ? "user" : "organization", // Map 'circle'/'project' to 'organization'
            // Add other required fields from Circle if necessary, with defaults/placeholders
            members: 0, // Default
        } as Content; // Cast needed due to potential missing fields
    }

    console.warn("Unmappable search result type:", item.type);
    return null; // Return null for unmappable types
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
    const [selectedCategories, setSelectedCategories] = useState<string[]>(["circles", "projects", "users", "posts"]); // Default categories
    const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);

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
    const handleSetZoomContent = useCallback(
        (item: SearchResultItem | Circle | undefined) => {
            if (!item) {
                setZoomContent(undefined);
                return;
            }
            // Check if it's SearchResultItem (has qdrantId or score) vs already Content compatible
            if ("qdrantId" in item || "score" in item) {
                // It's likely a SearchResultItem, map it
                const mappedItem = mapSearchResultToContent(item as SearchResultItem);
                if (mappedItem) {
                    setZoomContent(mappedItem);
                } else {
                    console.warn("Could not map search result item for zooming:", item);
                }
            } else {
                // Assume it's already a Content compatible object (Circle, PostDisplay, etc.)
                // We might need more specific checks if Content union type expands further
                setZoomContent(item as Content);
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
        if (!searchQuery.trim() || selectedCategories.length === 0) {
            setSearchResults([]);
            setDisplayedContent([]); // Clear map too
            return;
        }
        setIsSearching(true);
        try {
            console.log("Triggering search with query:", searchQuery, "categories:", selectedCategories);
            const results = await searchContentAction(searchQuery, selectedCategories);
            console.log("Search results received:", results.length);
            setSearchResults(results);
        } catch (error) {
            console.error("Search failed:", error);
            setSearchResults([]); // Clear results on error
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, selectedCategories, setDisplayedContent]);

    // Update map markers when search results change (only in explore mode)
    useEffect(() => {
        if (viewMode === "explore") {
            console.log("Updating map display with search results:", searchResults.length);
            const mappedResults = searchResults.map(mapSearchResultToContent).filter((c): c is Content => c !== null);
            setDisplayedContent(mappedResults); // Update atom with mapped results
        }
    }, [searchResults, viewMode, setDisplayedContent]);

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
            setSearchResults([]); // Clear search results state
        } else {
            // When switching to explore, update map with current search results
            console.log("Switching to explore view, showing search results on map:", searchResults.length);
            const mappedResults = searchResults.map(mapSearchResultToContent).filter((c): c is Content => c !== null);
            setDisplayedContent(mappedResults); // Use mapped results
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
    }, [displayedSwipeCircles, viewMode, handleSetZoomContent, setDisplayedContent]); // Use helper, Removed currentIndex dependency

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
                {" "}
                {/* Added flex-wrap */}
                {/* View Mode Toggle */}
                <ToggleGroup
                    type="single"
                    value={viewMode}
                    onValueChange={(value: ViewMode) => {
                        if (value) setViewMode(value);
                    }}
                    className="rounded-full bg-white p-1 shadow-md"
                >
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <ToggleGroupItem
                                    value="cards"
                                    aria-label="Toggle cards view"
                                    className="rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                                >
                                    <LayoutGrid className="h-5 w-5" />
                                </ToggleGroupItem>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Cards View</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <ToggleGroupItem
                                    value="explore"
                                    aria-label="Toggle explore view"
                                    className="rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                                >
                                    <MapPin className="h-5 w-5" />
                                </ToggleGroupItem>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Explore View</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </ToggleGroup>
                {/* Search Bar & Filters (Only in Explore Mode) */}
                {viewMode === "explore" && (
                    <div className="flex flex-wrap items-center gap-2 rounded-full bg-white p-1 px-2 shadow-md">
                        {" "}
                        {/* Added flex-wrap */}
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
                        <CategoryFilter
                            categories={["circles", "projects", "users", "posts"]} // Define available categories
                            selectedCategories={selectedCategories}
                            onSelectionChange={setSelectedCategories}
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
                        top: isMobile ? "80px" : "100px", // Adjusted top position slightly
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
                                        <div className="text-xl font-semibold">You've seen all circles!</div>
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

            {viewMode === "explore" && (
                // SearchResultsPanel (Placeholder implementation)
                <div className="absolute left-4 top-20 z-40 max-h-[calc(100vh-120px)] w-[300px] overflow-y-auto rounded-lg bg-white p-4 shadow-lg">
                    <h3 className="mb-2 font-semibold">Search Results</h3>
                    {isSearching && <p>Loading...</p>}
                    {!isSearching && searchResults.length === 0 && searchQuery.trim() && (
                        <p className="text-sm text-gray-500">No results found for "{searchQuery}".</p>
                    )}
                    {!isSearching && searchResults.length === 0 && !searchQuery.trim() && (
                        <p className="text-sm text-gray-500">Enter a query to search.</p>
                    )}
                    {!isSearching && searchResults.length > 0 && (
                        <ul>
                            {searchResults.map((item) => (
                                <li
                                    key={item.qdrantId}
                                    className="mb-1 cursor-pointer rounded border-b p-1 text-sm hover:bg-gray-100"
                                    onClick={() => item.location?.lngLat && handleSetZoomContent(item)} // Use helper, Only zoom if location exists
                                    title={item.location?.lngLat ? "Click to focus map" : "No location data"}
                                >
                                    <span className={!item.location?.lngLat ? "text-gray-400" : ""}>
                                        {item.name || item.content?.substring(0, 50) + "..."} ({item.type})
                                    </span>
                                    {!item.location?.lngLat && (
                                        <span className="ml-1 text-xs text-gray-400">(No location)</span>
                                    )}
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

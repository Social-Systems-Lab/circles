// map-explorer.tsx
"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Circle, WithMetric, Content, ContentPreviewData, MemberDisplay, Cause as SDG } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import { motion } from "framer-motion";
import CircleSwipeCard from "./circle-swipe-card";
import { MapDisplay } from "@/components/map/map";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
    RefreshCw,
    Hand,
    Home,
    Search,
    X,
    ArrowLeft,
    ChevronRight,
    Globe,
    CalendarIcon,
    AudioLines,
    ChevronDown,
} from "lucide-react"; // Added ArrowLeft
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { MdOutlineTravelExplore } from "react-icons/md";
import { HiChevronRight, HiMiniSquare2Stack } from "react-icons/hi2";
import { useAtom } from "jotai";
import {
    userAtom,
    zoomContentAtom,
    displayedContentAtom,
    contentPreviewAtom,
    sidePanelContentVisibleAtom, // Import contentPreviewAtom
    sidePanelModeAtom,
    sidePanelSearchStateAtom,
    mapSearchCommandAtom,
    drawerContentAtom,
} from "@/lib/data/atoms";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CirclePicture } from "./circle-picture";
import { completeSwipeOnboardingAction } from "./swipe-actions";
import { useRouter } from "next/navigation";
import { searchContentAction } from "../search/actions";
import CategoryFilter from "../search/category-filter";
import SdgFilter from "../search/sdg-filter";
import { SdgPanel } from "../search/SdgPanel";
import Indicators from "@/components/utils/indicators";
import ResizingDrawer from "@/components/ui/resizing-drawer"; // Correct import name
import ContentPreview from "@/components/layout/content-preview";
import { getOpenEventsForMapAction } from "./map-explorer-actions";
import { EventDisplay } from "@/models/models";
import ActivityPanel from "@/components/layout/activity-panel";

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
type DrawerContent = "explore" | "announcements" | "preview";

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
    const [viewMode, setViewMode] = useState<ViewMode>("explore");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>([]);
    const [allSearchResults, setAllSearchResults] = useState<WithMetric<Circle>[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [drawerContent, setDrawerContent] = useAtom(drawerContentAtom);
    // Events dataset for map
    const [eventsForMap, setEventsForMap] = useState<EventDisplay[]>([]);
    const [isEventsLoading, setIsEventsLoading] = useState(false);
    const filteredEventsForMap = useMemo(() => {
        let list = eventsForMap;
        if (selectedSdgs.length > 0) {
            const sdgHandles = selectedSdgs.map((s) => s.handle);
            list = list.filter((e) => e.causes?.some((cause) => sdgHandles.includes(cause)));
        }
        if (hasSearched && searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(
                (e) =>
                    (e.title && e.title.toLowerCase().includes(q)) ||
                    (e.description && e.description.toLowerCase().includes(q)),
            );
        }
        return list;
    }, [eventsForMap, selectedSdgs, hasSearched, searchQuery]);
    // Resonance filter state (min similarity threshold) and current dataset range
    const [minSimFilter, setMinSimFilter] = useState<number | undefined>(undefined);
    const [simRange, setSimRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });

    // Date range filter
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const dateLabel = useMemo(() => {
        if (dateRange?.from) {
            const from = format(dateRange.from, "MMM d, yyyy");
            const to = dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "Now";
            return `${from} – ${to}`;
        }
        return format(new Date(), "MMM d, yyyy");
    }, [dateRange]);

    const withinDateRange = useCallback(
        (d?: Date | string) => {
            if (!dateRange?.from && !dateRange?.to) return true;
            if (!d) return false;
            const dt = typeof d === "string" ? new Date(d) : d;
            const fromT = dateRange.from ? new Date(dateRange.from).setHours(0, 0, 0, 0) : undefined;
            const toT = dateRange.to ? new Date(dateRange.to).setHours(23, 59, 59, 999) : Date.now();
            const t = dt.getTime();
            return (fromT ? t >= fromT : true) && t <= (toT as number);
        },
        [dateRange],
    );

    // State to control the drawer's active snap index
    const [isMounted, setIsMounted] = useState(false);
    const [showSwipeInstructions, setShowSwipeInstructions] = useState(false);
    const [triggerSnapIndex, setTriggerSnapIndex] = useState<number>(-1);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [panelMode, setSidePanelMode] = useAtom(sidePanelModeAtom);
    const [, setSearchPanelState] = useAtom(sidePanelSearchStateAtom);
    const [mapSearchCommand] = useAtom(mapSearchCommandAtom);
    const [lastSearchCmdTs, setLastSearchCmdTs] = useState<number>(-1);
    const showTopSearchInput = isMobile || panelMode !== "search";

    // --- Memos ---
    const snapPoints = useMemo(() => [100, windowHeight * 0.4, windowHeight * 0.8, windowHeight], [windowHeight]);

    const filterCirclesByCategory = useCallback((circles: WithMetric<Circle>[], category: string | null) => {
        // ... (no changes) ...
        if (!category) return circles;
        const typeToFilter = category === "communities" ? "circle" : category === "projects" ? "project" : "user";
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
        let results = allSearchResults;

        if (selectedCategory) {
            const typeToFilter =
                selectedCategory === "communities" ? "circle" : selectedCategory === "projects" ? "project" : "user";
            results = results.filter((result) => result.circleType === typeToFilter);
        }

        if (selectedSdgs.length > 0) {
            const sdgHandles = selectedSdgs.map((s) => s.handle);
            results = results.filter((c) => c.causes?.some((cause) => sdgHandles.includes(cause)));
        }

        return results;
    }, [allSearchResults, selectedCategory, selectedSdgs]);

    const categoryCounts = useMemo(() => {
        // Include events count from filteredEventsForMap
        const counts: { [key: string]: number } = {
            communities: 0,
            projects: 0,
            users: 0,
            events: filteredEventsForMap.length,
        };
        filteredSearchResults?.forEach((result) => {
            if (result.circleType === "circle") counts.communities++;
            else if (result.circleType === "project") counts.projects++;
            else if (result.circleType === "user") counts.users++;
        });
        return counts;
    }, [filteredSearchResults, filteredEventsForMap.length]);

    // Determine data source for the drawer list
    // Base circles used for map/list before mapping to Content
    const baseCircles = useMemo(() => {
        if (hasSearched) {
            return filteredSearchResults;
        } else {
            let circlesToDisplay = allDiscoverableCircles;
            if (selectedSdgs.length > 0) {
                const sdgHandles = selectedSdgs.map((s) => s.handle);
                circlesToDisplay = circlesToDisplay.filter((c) =>
                    c.causes?.some((cause) => sdgHandles.includes(cause)),
                );
            }
            return filterCirclesByCategory(circlesToDisplay, selectedCategory);
        }
    }, [
        hasSearched,
        filteredSearchResults,
        allDiscoverableCircles,
        selectedSdgs,
        selectedCategory,
        filterCirclesByCategory,
    ]);

    // Compute current similarity range from dataset
    const simStats = useMemo(() => {
        const sims = baseCircles.map((c) => c.metrics?.similarity).filter((s): s is number => s !== undefined);
        if (sims.length === 0) return { min: 0, max: 1 };
        return { min: Math.min(...sims), max: Math.max(...sims) };
    }, [baseCircles]);

    // Keep state in sync with dataset range
    useEffect(() => {
        setSimRange(simStats);
        setMinSimFilter((prev) => {
            if (prev === undefined) return simStats.min;
            return Math.min(Math.max(prev, simStats.min), simStats.max);
        });
    }, [simStats]);

    const drawerListData = useMemo(() => {
        let list = baseCircles;
        if (minSimFilter !== undefined) {
            list = list.filter((c) => c.metrics?.similarity === undefined || c.metrics!.similarity >= minSimFilter);
        }
        if (dateRange?.from || dateRange?.to) {
            list = list.filter((c) => withinDateRange((c as any).createdAt));
        }
        return list;
    }, [baseCircles, minSimFilter, dateRange, withinDateRange]);

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
        const searchCategoriesForBackend = ["circles", "users"];
        const sdgHandles = selectedSdgs.map((sdg) => sdg.handle);
        if (!searchQuery.trim() && sdgHandles.length === 0) {
            // If clearing search via empty query, reset state
            setAllSearchResults([]);
            setDisplayedContent(
                filterCirclesByCategory(allDiscoverableCircles, selectedCategory)
                    .map(mapItemToContent)
                    .filter((c): c is Content => c !== null),
            );
            setHasSearched(false);
            setTriggerSnapIndex(SNAP_INDEX_PEEK); // Reset drawer to peek
            setContentPreview(undefined); // Clear preview

            // Close global left search panel
            setSidePanelMode("none");
            setSearchPanelState({
                query: "",
                isSearching: false,
                hasSearched: false,
                selectedCategory: null,
                selectedSdgHandles: [],
                items: [],
                counts: { communities: 0, projects: 0, users: 0, events: filteredEventsForMap.length },
            });
            return;
        }

        // Open global left search panel in searching state (desktop UX)
        setSidePanelMode("search");
        setSearchPanelState({
            query: searchQuery,
            isSearching: true,
            hasSearched: false,
            selectedCategory: selectedCategory ?? null,
            selectedSdgHandles: sdgHandles,
            items: [],
            counts: { communities: 0, projects: 0, users: 0, events: filteredEventsForMap.length },
        });
        if (!isMobile) {
            router.push("/explore?panel=search");
        }

        setIsSearching(true);
        setHasSearched(true);
        setAllSearchResults([]);
        setDisplayedContent([]);
        setContentPreview(undefined); // Clear preview on new search

        try {
            const results = await searchContentAction(searchQuery, searchCategoriesForBackend, sdgHandles);
            setAllSearchResults(results);

            // Compute filtered list and counts for left panel now
            let filtered = results;
            if (selectedCategory) {
                const typeToFilter =
                    selectedCategory === "communities"
                        ? "circle"
                        : selectedCategory === "projects"
                          ? "project"
                          : "user";
                filtered = filtered.filter((r) => r.circleType === typeToFilter);
            }
            if (selectedSdgs.length > 0) {
                const sdgHandlesLocal = selectedSdgs.map((s) => s.handle);
                filtered = filtered.filter((c) => c.causes?.some((cause) => sdgHandlesLocal.includes(cause)));
            }
            const counts = { communities: 0, projects: 0, users: 0, events: filteredEventsForMap.length };
            filtered.forEach((r: any) => {
                if (r.circleType === "circle") counts.communities++;
                else if (r.circleType === "project") counts.projects++;
                else if (r.circleType === "user") counts.users++;
            });

            setSearchPanelState({
                query: searchQuery,
                isSearching: false,
                hasSearched: true,
                selectedCategory: selectedCategory ?? null,
                selectedSdgHandles: sdgHandles,
                // Include events in search results panel (events first for clarity)
                items: [...filteredEventsForMap, ...filtered] as any,
                counts,
            });
            setSidePanelMode("search");

            // Requirement 1: Jump to half-open state after search
            setTriggerSnapIndex(SNAP_INDEX_HALF);
        } catch (error) {
            console.error("Search action failed:", error);
            setAllSearchResults([]);

            // Reflect error state in left panel
            setSearchPanelState({
                query: searchQuery,
                isSearching: false,
                hasSearched: true,
                selectedCategory: selectedCategory ?? null,
                selectedSdgHandles: sdgHandles,
                items: [],
                counts: { communities: 0, projects: 0, users: 0, events: filteredEventsForMap.length },
            });

            setTriggerSnapIndex(SNAP_INDEX_PEEK); // Reset drawer on error
        } finally {
            setIsSearching(false);
        }
    }, [
        searchQuery,
        selectedSdgs,
        setDisplayedContent,
        allDiscoverableCircles,
        selectedCategory,
        filterCirclesByCategory,
        setContentPreview,
    ]);

    const handleClearSearch = useCallback(() => {
        setSearchQuery("");
        setAllSearchResults([]);
        setHasSearched(false);
        setSelectedCategory(null);
        setSelectedSdgs([]);
        const resetMapData = filterCirclesByCategory(allDiscoverableCircles, null)
            .map((circle) => mapItemToContent(circle))
            .filter((c): c is Content => c !== null);
        setDisplayedContent(resetMapData);
        setTriggerSnapIndex(SNAP_INDEX_PEEK); // Reset drawer to peek
        setContentPreview(undefined); // Clear preview

        // Also reset/close the desktop left search panel so the map search box reappears
        setSidePanelMode("none");
        setSearchPanelState({
            query: "",
            isSearching: false,
            hasSearched: false,
            selectedCategory: null,
            selectedSdgHandles: [],
            items: [],
            counts: { communities: 0, projects: 0, users: 0, events: filteredEventsForMap.length },
        });

        console.log("Search cleared, resetting map to all discoverable circles:", resetMapData.length);
    }, [
        setDisplayedContent,
        allDiscoverableCircles,
        filterCirclesByCategory,
        setContentPreview, // Add dependency
    ]);

    const handleTriggerConsumed = useCallback(() => {
        console.log("Drawer consumed trigger, resetting triggerSnapIndex to -1");
        setTriggerSnapIndex(-1);
    }, []);

    // Quick date range presets for the date filter
    const setQuickDateRange = useCallback(
        (preset: "today" | "7d" | "30d" | "all") => {
            const now = new Date();
            const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

            if (preset === "all") {
                setDateRange(undefined);
                return;
            }
            if (preset === "today") {
                setDateRange({ from: startOfDay(now), to: undefined });
                return;
            }

            const days = preset === "7d" ? 7 : 30;
            const from = new Date(now);
            from.setDate(now.getDate() - (days - 1));
            setDateRange({ from: startOfDay(from), to: undefined });
        },
        [setDateRange],
    );

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

    // Listen for map search commands from the left search panel (desktop)
    useEffect(() => {
        if (!mapSearchCommand) return;
        if (mapSearchCommand.timestamp === lastSearchCmdTs) return;
        setLastSearchCmdTs(mapSearchCommand.timestamp);
        const q = mapSearchCommand.query ?? "";
        if (!q.trim()) {
            handleClearSearch();
        } else {
            setSearchQuery(q);
            // Defer to let state commit before triggering search
            setTimeout(() => {
                handleSearchTrigger();
            }, 0);
        }
    }, [mapSearchCommand, lastSearchCmdTs, handleClearSearch, handleSearchTrigger]);

    // Fetch events for map when date range changes
    useEffect(() => {
        let canceled = false;
        const load = async () => {
            setIsEventsLoading(true);
            try {
                const range =
                    dateRange && (dateRange.from || dateRange.to)
                        ? {
                              from: dateRange.from ? dateRange.from.toISOString() : undefined,
                              to: dateRange.to ? dateRange.to.toISOString() : undefined,
                          }
                        : undefined;
                const data = await getOpenEventsForMapAction(range as any);
                if (!canceled) {
                    setEventsForMap((data || []).filter((e: any) => e?.location?.lngLat));
                }
            } catch (e) {
                console.error("Failed to load events for map:", e);
                if (!canceled) setEventsForMap([]);
            } finally {
                if (!canceled) setIsEventsLoading(false);
            }
        };
        load();
        return () => {
            canceled = true;
        };
    }, [dateRange?.from, dateRange?.to]);

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
        if (viewMode === "explore") {
            // When "events" category is selected, show only event markers
            if (selectedCategory === "events") {
                setDisplayedContent(filteredEventsForMap as unknown as Content[]);
                return;
            }
            let circles = baseCircles;
            if (minSimFilter !== undefined) {
                circles = circles.filter(
                    (c) => c.metrics?.similarity === undefined || c.metrics!.similarity >= minSimFilter,
                );
            }
            if (dateRange?.from || dateRange?.to) {
                circles = circles.filter((c) => withinDateRange((c as any).createdAt));
            }
            const mapData: Content[] = circles
                .map((circle) => mapItemToContent(circle))
                .filter((c): c is Content => c !== null);

            // Default: combine circles with filtered events
            const combined: Content[] = [...mapData, ...(filteredEventsForMap as unknown as Content[])];
            setDisplayedContent(combined);
        }
    }, [
        viewMode,
        baseCircles,
        minSimFilter,
        dateRange,
        withinDateRange,
        setDisplayedContent,
        selectedCategory,
        filteredEventsForMap,
    ]);

    // Control drawer snap based on contentPreview state
    useEffect(() => {
        if (isMobile && viewMode === "explore") {
            if (drawerContent === "announcements") {
                setTriggerSnapIndex(SNAP_INDEX_HALF);
            } else if (contentPreview) {
                setDrawerContent("preview");
                // Requirement 4: Expand drawer when preview is shown
                setTriggerSnapIndex(SNAP_INDEX_OPEN);
            } else {
                // When preview is closed, return to half if search active, else peek
                setTriggerSnapIndex(hasSearched ? SNAP_INDEX_HALF : SNAP_INDEX_PEEK);
            }
        }
        // Add dependencies that should trigger this logic
    }, [contentPreview, isMobile, viewMode, hasSearched, drawerContent]);

    // Reset drawer and preview when switching view modes or leaving mobile explore
    useEffect(() => {
        if (!isMobile || viewMode !== "explore") {
            setTriggerSnapIndex(SNAP_INDEX_PEEK); // Reset to base state
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
                className={`absolute ${isMobile ? "flex-col" : "flex-row"} z-[60] flex gap-2`} // Increased z-index
                style={{ left: !isMobile && panelMode !== "none" ? 440 : 16, top: 16 }}
            >
                {/* View Mode Toggle removed: Explore mode only */}

                {/* Search Bar & Filters (Only in Explore Mode) */}
                {viewMode === "explore" && !(sidePanelContentVisible === "toolbox" && isMobile) && (
                    <div className="relative">
                        <div className="absolute flex items-center gap-2">
                            {/* Search Input (hidden on desktop when panel is open) */}
                            {showTopSearchInput && (
                                <div className="flex items-center rounded-full bg-white p-1 px-3 shadow-md">
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
                            )}
                            {/* Filters */}
                            <div className="flex items-center">
                                {!isMobile && (
                                    <CategoryFilter
                                        categories={["communities", "projects", "users", "events"]}
                                        categoryCounts={categoryCounts}
                                        selectedCategory={selectedCategory}
                                        onSelectionChange={setSelectedCategory}
                                        hasSearched={hasSearched}
                                        displayLabelMap={{ users: "people" }}
                                    />
                                )}
                                <SdgFilter
                                    selectedSdgs={selectedSdgs}
                                    onSelectionChange={setSelectedSdgs}
                                    displayAs="popover"
                                    gridCols="grid-cols-3"
                                    trigger={
                                        <Button
                                            variant="ghost"
                                            className="ml-2 flex h-auto items-center gap-2 rounded-full border bg-white px-5 py-1.5 text-sm shadow-sm data-[selected=true]:border-primary"
                                            data-selected={selectedSdgs.length > 0}
                                        >
                                            {selectedSdgs.length === 0 ? (
                                                <Image
                                                    src="/images/sdgs/SDG_Wheel_WEB.png"
                                                    alt="SDG Wheel"
                                                    width={16}
                                                    height={16}
                                                    className="h-4 w-4"
                                                />
                                            ) : (
                                                <div
                                                    className="flex flex-row -space-x-2"
                                                    style={{
                                                        width: `calc(16px + ${12 * Math.min(selectedSdgs.length - 1, 2)}px)`,
                                                    }}
                                                >
                                                    {selectedSdgs.slice(0, 3).map((sdg) => (
                                                        <Image
                                                            key={sdg.handle}
                                                            src={sdg.picture?.url ?? "/images/default-picture.png"}
                                                            alt={sdg.name}
                                                            width={16}
                                                            height={16}
                                                            className="h-4 w-4 rounded-full border-2 border-white object-cover"
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                            <div className="hidden md:block">
                                                SDGs {selectedSdgs.length > 0 && `(${selectedSdgs.length})`}
                                            </div>
                                        </Button>
                                    }
                                />
                            </div>
                        </div>

                        {/* Resonance slider + Date filter */}
                        <div className="absolute left-0 top-[56px] z-40 flex items-center gap-3 rounded-full bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
                            <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
                                            <AudioLines className="h-4 w-4 text-indigo-500" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        <p>Minimum similarity threshold. Higher = closer match.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <div className="w-[180px] sm:w-[200px]">
                                <Slider
                                    min={simRange.min}
                                    max={simRange.max}
                                    step={0.01}
                                    value={[minSimFilter ?? simRange.min]}
                                    onValueChange={(v) => setMinSimFilter(v[0])}
                                />
                            </div>

                            <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-black/5">
                                {Math.round((minSimFilter ?? simRange.min) * 100)}%
                            </span>

                            <div className="mx-2 h-4 w-px bg-gray-200/80" />

                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="flex items-center gap-1 rounded-full border border-gray-200/70 bg-white/70 px-2.5 py-1 text-xs text-gray-700 shadow-sm hover:bg-white">
                                        <CalendarIcon className="h-3.5 w-3.5 text-gray-600" />
                                        <span className="max-w-[160px] truncate">{dateLabel}</span>
                                        <ChevronDown className="h-3 w-3 text-gray-500" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto rounded-xl border border-gray-100 p-3 shadow-xl"
                                    align="start"
                                >
                                    <div className="mb-2 flex gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setQuickDateRange("today")}
                                        >
                                            Today
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setQuickDateRange("7d")}
                                        >
                                            7d
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setQuickDateRange("30d")}
                                        >
                                            30d
                                        </Button>
                                    </div>
                                    <Calendar
                                        mode="range"
                                        selected={dateRange}
                                        onSelect={setDateRange as any}
                                        numberOfMonths={2}
                                        defaultMonth={dateRange?.from}
                                    />
                                    <div className="mt-3 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                                            Clear
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
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
                                                <Home className="h-4 w-4" /> Go to Announcements
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
                                <div className="text-xl font-semibold">No communities to show!</div>
                                <p className="text-center text-gray-600">
                                    You might have seen, followed, or ignored all available communities.
                                </p>
                                <div className="flex flex-row gap-2">
                                    <Button onClick={handleExplore} className="mt-4 gap-2">
                                        <MdOutlineTravelExplore className="h-4 w-4" /> Explore
                                    </Button>
                                    <Button onClick={goToFeed} className="mt-4 gap-2">
                                        <Home className="h-4 w-4" /> Go to Announcements
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            )}

            {/* Desktop Search Results Panel moved to global left panel */}
            {false && viewMode === "explore" && hasSearched && !isMobile && (
                <div className="formatted absolute left-4 top-[120px] z-40 max-h-[calc(100vh-130px)] w-[300px] overflow-y-auto rounded-lg bg-white shadow-lg">
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
                                    (item): item is Circle | MemberDisplay =>
                                        "circleType" in (item as any) &&
                                        ((item as any).circleType === "user" ||
                                            (item as any).circleType === "circle" ||
                                            (item as any).circleType === "project"),
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
                                                {"name" in item && item.name ? item.name : "Announcement"}
                                            </div>
                                            <div className="mt-1 line-clamp-2 p-0 text-xs text-gray-500">
                                                {/* Handle description/content/mission based on type */}
                                                {"description" in item
                                                    ? (item.description ??
                                                      ("mission" in item ? item.mission : "") ??
                                                      "")
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

            {/* Mobile Explore Drawer */}
            {viewMode === "explore" && isMobile && windowHeight > 0 && (
                <ResizingDrawer
                    snapPoints={snapPoints}
                    initialSnapPointIndex={SNAP_INDEX_PEEK} // Start at peek
                    triggerSnapIndex={triggerSnapIndex}
                    onTriggerConsumed={handleTriggerConsumed}
                    moveThreshold={60} // Adjust as needed
                    // Optional: Get notified when drawer snaps internally
                    // onSnapChange={(index) => setDrawerSnapIndex(index)}
                >
                    {drawerContent === "preview" ? (
                        // --- Content Preview View ---
                        <div className="flex h-full flex-col">
                            <div className="flex items-center border-b px-0 py-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDrawerContent("explore")}
                                    className="mr-2"
                                >
                                    <ArrowLeft className="mr-1 h-4 w-4" /> Back to List
                                </Button>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                <ContentPreview />
                            </div>
                        </div>
                    ) : drawerContent === "announcements" ? (
                        // --- Announcements View ---
                        <div className="flex h-full flex-col">
                            <div className="flex-1 overflow-y-auto">
                                <ActivityPanel />
                            </div>
                        </div>
                    ) : (
                        // --- List View (Default / Search Results) ---
                        <div className="flex-1 rounded-t-[10px] bg-white pt-0">
                            <div className="mx-0 px-4 pb-4">
                                {isSearching && <p className="py-4 text-center">Loading...</p>}
                                {!isSearching && drawerListData.length === 0 && (
                                    <p className="py-4 text-center text-sm text-gray-500">
                                        {hasSearched
                                            ? `No results found for "${searchQuery}".`
                                            : "No communities found."}
                                    </p>
                                )}
                                {!isSearching && drawerListData.length > 0 && (
                                    <ul className="space-y-2">
                                        {drawerListData.map((item) => (
                                            <li
                                                key={item._id}
                                                className="flex cursor-pointer items-center gap-2 rounded pb-2 pt-1 hover:bg-gray-100"
                                                onClick={() => {
                                                    const previewData: ContentPreviewData = {
                                                        type: (item.circleType || "circle") as any,
                                                        content: item as any,
                                                    };
                                                    setContentPreview(previewData);
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
                                {isMobile && (
                                    <div className="mt-4">
                                        <SdgFilter
                                            selectedSdgs={selectedSdgs}
                                            onSelectionChange={setSelectedSdgs}
                                            displayAs="popover"
                                            gridCols="grid-cols-2"
                                            trigger={
                                                <Button
                                                    variant="outline"
                                                    className="flex w-full items-center justify-center gap-2"
                                                >
                                                    <Image
                                                        src="/images/sdgs/SDG_Wheel_WEB.png"
                                                        alt="SDG Wheel"
                                                        width={20}
                                                        height={20}
                                                    />
                                                    <span>Filter by SDGs</span>
                                                    {selectedSdgs.length > 0 && `(${selectedSdgs.length})`}
                                                </Button>
                                            }
                                        />
                                    </div>
                                )}
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

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Circle, WithMetric } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import { motion } from "framer-motion";
import CircleSwipeCard from "./circle-swipe-card";
import { MapDisplay } from "@/components/map/map";
import { Button } from "@/components/ui/button";
import { RefreshCw, Binoculars, X, Hand } from "lucide-react";
import { useAtom } from "jotai";
import { userAtom, zoomContentAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { completeSwipeOnboardingAction } from "./swipe-actions";

interface MapSwipeContainerProps {
    circles: WithMetric<Circle>[];
    mapboxKey: string;
}

export const MapSwipeContainer: React.FC<MapSwipeContainerProps> = ({ circles, mapboxKey }) => {
    const [displayedCircles, setDisplayedCircles] = useState<WithMetric<Circle>[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [user] = useAtom(userAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const isMobile = useIsMobile();
    const { windowWidth, windowHeight } = useWindowDimensions();
    const [showCards, setShowCards] = useState(true); // State to toggle card visibility

    // Filter out circles the user already follows or has ignored
    useEffect(() => {
        if (!user) return;

        const userFollowedIds = (user.memberships || []).map((m) => m.circleId);
        const userPendingIds = (user.pendingRequests || []).map((r) => r.circleId);
        const userIgnoredIds = user.ignoredCircles || [];

        const filtered = circles.filter(
            (circle) =>
                !userFollowedIds.includes(circle._id) &&
                !userPendingIds.includes(circle._id) &&
                !userIgnoredIds.includes(circle._id),
        );

        console.log("ignoredCircles", userIgnoredIds);
        setDisplayedCircles(filtered);
    }, [circles, user?.did]); // intentionally only update when user did changes

    const handleSwiped = useCallback((circle: Circle, direction: "left" | "right") => {
        // Move to the next card
        setCurrentIndex((prev) => {
            const newIndex = prev + 1;
            return newIndex;
        });
    }, []);

    // Update map zoom whenever currentIndex changes
    useEffect(() => {
        if (currentIndex < displayedCircles.length) {
            const currentCircle = displayedCircles[currentIndex];
            if (currentCircle?.location?.lngLat) {
                // Slight delay to ensure the map component has processed any previous zoom commands
                setTimeout(() => {
                    setZoomContent(currentCircle);
                }, 100);
            }
        }
    }, [currentIndex, displayedCircles, setZoomContent]);

    const handleRefresh = () => {
        window.location.reload();
    };

    // Initial focus on first circle when loaded
    useEffect(() => {
        if (displayedCircles.length > 0 && currentIndex === 0) {
            const firstCircle = displayedCircles[0];
            if (firstCircle?.location?.lngLat) {
                // Allow a short delay for map initialization
                setTimeout(() => {
                    setZoomContent(firstCircle);
                }, 300);
            }
        }
    }, [displayedCircles, currentIndex, setZoomContent]);

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    const [showSwipeInstructions, setShowSwipeInstructions] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        // Check if the user has completed the swipe onboarding
        if (
            user &&
            displayedCircles.length > 0 &&
            (!user.completedOnboardingSteps || !user.completedOnboardingSteps.includes("swipe"))
        ) {
            setShowSwipeInstructions(true);
        }
    }, [user, displayedCircles]);

    const handleGotIt = async () => {
        setShowSwipeInstructions(false);
        if (user) {
            // Add "swipe" to completedOnboardingSteps
            await completeSwipeOnboardingAction();
        }
    };

    if (!isMounted) {
        return null;
    }

    return (
        <div className="relative flex h-full w-full flex-row overflow-hidden">
            {/* Map container */}
            {!isMobile && mapboxKey && (
                <div className="relative flex-1">
                    <MapDisplay mapboxKey={mapboxKey} />
                </div>
            )}

            {/* Toggle button for cards */}
            {!isMobile && (
                <div className="absolute left-4 top-4 z-50">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={() => setShowCards(!showCards)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white p-2 shadow-md hover:bg-gray-100"
                                    variant="ghost"
                                    size="icon"
                                >
                                    {showCards ? <X className="h-5 w-5" /> : <Binoculars className="h-5 w-5" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{showCards ? "Hide cards" : "Show cards"}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            {/* Cards container - positioned on the left for desktop or full-width for mobile */}
            <div
                className={cn(
                    `absolute z-40 flex flex-col items-center justify-start overflow-visible transition-all duration-300`,
                    isMobile ? "w-full" : "w-[400px]",
                    !showCards && "pointer-events-none opacity-0",
                )}
                style={{
                    top: isMobile ? "80px" : "100px",
                    height: `calc(${windowHeight}px - 150px)`,
                    transform: showCards ? "translateX(0)" : "translateX(-20px)",
                }}
            >
                <div className="relative mb-4 flex w-full max-w-[400px] flex-col items-center">
                    {/* <h2 className="mb-4 text-xl font-bold text-white drop-shadow-md">Discover Circles</h2> */}
                    {/* Swipe instruction text */}
                    {/* {displayedCircles.length > 0 && currentIndex < displayedCircles.length && (
                        <div className="mb-4 flex text-center text-sm text-gray-500">
                            <span className="mr-2">← Swipe left to ignore</span>
                            <span className="ml-2">Swipe right to follow →</span>
                        </div>
                    )} */}
                    {displayedCircles.length > 0 ? (
                        <div className="relative flex h-[500px] w-full max-w-[400px] items-center justify-center">
                            {/* Display current card with stack effect for upcoming cards */}
                            {currentIndex < displayedCircles.length && (
                                <>
                                    {/* Current card (interactive) */}
                                    <CircleSwipeCard
                                        key={displayedCircles[currentIndex]._id}
                                        circle={displayedCircles[currentIndex]}
                                        onSwiped={handleSwiped}
                                        zIndex={30}
                                    />

                                    {/* Stacked cards (next up to 4 cards) */}
                                    {displayedCircles.slice(currentIndex + 1, currentIndex + 5).map((circle, index) => (
                                        <div
                                            key={circle._id}
                                            className="absolute h-[450px] max-w-[400px] overflow-hidden rounded-xl border bg-white shadow-lg md:h-[500px]"
                                            style={{
                                                zIndex: 29 - index,
                                                transform: `translateX(${(index + 1) * 3}px) translateY(${(index + 1) * -2}px)`,
                                                opacity: 0.9 - index * 0.15,
                                                pointerEvents: "none",
                                                width: "calc(100% - 2rem)",
                                            }}
                                        >
                                            {/* Simplified preview of card content */}
                                            <div className="relative h-3/5 w-full overflow-hidden">
                                                <Image
                                                    src={circle.cover?.url ?? "/images/default-cover.png"}
                                                    alt=""
                                                    className="pointer-events-none object-cover"
                                                    fill
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Show refresh button if we've gone through all cards */}
                            {(currentIndex >= displayedCircles.length || displayedCircles.length === 0) && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center gap-4 rounded-xl border bg-white p-8 shadow-lg"
                                >
                                    <div className="text-xl font-semibold">You&apos;ve seen all circles!</div>
                                    <p className="text-center text-gray-600">
                                        Check back later for more recommendations
                                    </p>
                                    <Button onClick={handleRefresh} className="mt-4 gap-2">
                                        <RefreshCw className="h-4 w-4" />
                                        Refresh
                                    </Button>
                                </motion.div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-8 shadow-lg">
                            <div className="text-xl font-semibold">No circles to discover</div>
                            <p className="text-center text-gray-600">
                                You&apos;ve already explored all available circles
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {/* Swipe instructions popup with animated hand */}
            {showSwipeInstructions && (
                <motion.div
                    className="absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50"
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
                                animate={{
                                    x: [0, -40, 0, 40, 0],
                                }}
                                transition={{
                                    repeat: Infinity,
                                    duration: 4,
                                    times: [0, 0.25, 0.5, 0.75, 1],
                                }}
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

                        <p className="mb-6 text-gray-600">
                            Swipe card to the right to follow the circle, user or project. Swipe left to ignore ones
                            that don&apos;t interest you.
                        </p>

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

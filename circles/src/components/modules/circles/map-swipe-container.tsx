"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Circle, WithMetric } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import { motion } from "framer-motion";
import CircleSwipeCard from "./circle-swipe-card";
import { MapDisplay } from "@/components/map/map";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useAtom } from "jotai";
import { userAtom, zoomContentAtom } from "@/lib/data/atoms";

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

        setDisplayedCircles(filtered);
    }, [circles, user]);

    const handleSwiped = useCallback(
        (circle: Circle, direction: "left" | "right") => {
            // Move to the next card
            setCurrentIndex((prev) => prev + 1);

            // Focus on the location of the new top card
            if (currentIndex + 1 < displayedCircles.length) {
                const nextCircle = displayedCircles[currentIndex + 1];
                if (nextCircle.location?.lngLat) {
                    setZoomContent(nextCircle);
                }
            }
        },
        [currentIndex, displayedCircles, setZoomContent],
    );

    const handleRefresh = () => {
        // Reset to the first card
        setCurrentIndex(0);
        if (displayedCircles.length > 0 && displayedCircles[0].location?.lngLat) {
            setZoomContent(displayedCircles[0]);
        }
    };

    // Focus on first circle when loaded
    useEffect(() => {
        if (displayedCircles.length > 0 && displayedCircles[0].location?.lngLat) {
            setZoomContent(displayedCircles[0]);
        }
    }, [displayedCircles, setZoomContent]);

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

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

            {/* Cards container - positioned on the left for desktop or full-width for mobile */}
            <div
                className={`absolute left-4 z-40 flex flex-col items-center justify-start overflow-visible ${
                    isMobile ? "w-full" : "w-[400px]"
                }`}
                style={{
                    top: isMobile ? "80px" : "100px",
                    height: `calc(${windowHeight}px - 150px)`,
                }}
            >
                <div className="relative mb-4 flex w-full max-w-[400px] flex-col items-center">
                    {/* <h2 className="mb-4 text-xl font-bold text-white drop-shadow-md">Discover Circles</h2> */}

                    {displayedCircles.length > 0 ? (
                        <div className="relative flex h-[500px] w-full max-w-[400px] items-center justify-center">
                            {/* Display top 3 cards with stacking effect */}
                            {displayedCircles.slice(currentIndex, currentIndex + 3).map((circle, index) => (
                                <CircleSwipeCard
                                    key={circle._id}
                                    circle={circle}
                                    onSwiped={handleSwiped}
                                    zIndex={30 - index}
                                />
                            ))}

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
                                        Start Over
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
        </div>
    );
};

export default MapSwipeContainer;

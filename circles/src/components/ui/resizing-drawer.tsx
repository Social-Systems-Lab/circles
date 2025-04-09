// resizing-drawer.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useDrag, DragState } from "@use-gesture/react";
import { animated, useSpring, config } from "@react-spring/web";

interface ResizingDrawerProps {
    children: React.ReactNode;
    snapPoints: (number | string)[];
    initialSnapPointIndex?: number;
    containerRef?: React.RefObject<HTMLElement>;
    moveThreshold?: number;
    animationConfig?: object;
    activeSnapIndex?: number;
    onSnapChange?: (index: number) => void;

    triggerSnapIndex?: number; // New: Index to trigger animation to (-1 or undefined means no trigger)
    onTriggerConsumed?: () => void;
}

const ResizingDrawer = ({
    children,
    snapPoints: rawSnapPoints,
    initialSnapPointIndex = 0,
    containerRef,
    moveThreshold = 50,
    animationConfig = config.stiff,
    activeSnapIndex,
    onSnapChange,
    triggerSnapIndex, // New
    onTriggerConsumed, // New
}: ResizingDrawerProps) => {
    const AnimatedComponent = animated.div as React.ElementType;
    const drawerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const touchTargetRef = useRef<HTMLDivElement>(null);

    const [containerHeight, setContainerHeight] = useState<number>(
        typeof window !== "undefined" ? window.innerHeight : 0,
    );
    const [isMounted, setIsMounted] = useState(false);

    // --- Container Height Calculation --- (remains the same)
    useEffect(() => {
        setIsMounted(true);
        let targetElement = containerRef?.current ?? window;
        let initialHeight = targetElement instanceof Window ? targetElement.innerHeight : targetElement.clientHeight;
        setContainerHeight(initialHeight);

        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });

        if (containerRef?.current) {
            resizeObserver.observe(containerRef.current);
        } else {
            window.addEventListener("resize", handleResize);
        }

        function handleResize() {
            setContainerHeight(window.innerHeight);
        }

        return () => {
            if (containerRef?.current) {
                resizeObserver.unobserve(containerRef.current);
            } else {
                window.removeEventListener("resize", handleResize);
            }
            resizeObserver.disconnect();
        };
    }, [containerRef]);

    // --- Snap Point Calculation --- (remains the same)
    const sortedSnapPoints = useMemo(() => {
        if (containerHeight <= 0) return [];
        return (
            rawSnapPoints
                ?.map((p) => {
                    if (typeof p === "string" && p.endsWith("%")) {
                        const percentage = parseFloat(p) / 100;
                        return containerHeight * percentage;
                    }
                    if (typeof p === "number") {
                        return p;
                    }
                    return -1;
                })
                .filter((p): p is number => p >= 0)
                .sort((a, b) => a - b) ?? []
        );
    }, [rawSnapPoints, containerHeight]);

    const minSnap = sortedSnapPoints?.[0] ?? 0;
    const maxSnap = sortedSnapPoints?.[sortedSnapPoints.length - 1] ?? 0;

    const safeInitialIndex = useMemo(() => {
        if (sortedSnapPoints?.length === 0) return 0;
        return Math.max(0, Math.min(initialSnapPointIndex, sortedSnapPoints?.length - 1));
    }, [initialSnapPointIndex, sortedSnapPoints?.length]);

    const initialSnapHeight = useMemo(() => {
        if (sortedSnapPoints.length === 0) return 0;
        return Math.max(minSnap, sortedSnapPoints[safeInitialIndex] ?? minSnap);
    }, [sortedSnapPoints, safeInitialIndex, minSnap]);

    const currentSnapIndexRef = useRef<number>(safeInitialIndex);
    const dragStartSnapHeightRef = useRef<number>(initialSnapHeight);
    const dragStartSnapIndexRef = useRef<number>(safeInitialIndex);

    // --- Spring Animation --- (remains the same)
    const [{ height: animatedHeight }, api] = useSpring(() => ({
        height: initialSnapHeight > 0 ? initialSnapHeight : 0,
        config: animationConfig,
        onRest: (result) => {
            if (!result.cancelled) {
                const finalHeight = result.value.height;
                let closestIndex = 0;
                let minDist = Infinity;
                sortedSnapPoints?.forEach((snapH, index) => {
                    const dist = Math.abs(finalHeight - snapH);
                    if (dist < minDist && dist < 1) {
                        minDist = dist;
                        closestIndex = index;
                    }
                });
                if (currentSnapIndexRef.current !== closestIndex) {
                    currentSnapIndexRef.current = closestIndex;
                    onSnapChange?.(closestIndex);
                }
            }
        },
    }));

    // --- Effect for Initial Height --- (remains the same)
    useEffect(() => {
        if (isMounted && initialSnapHeight > 0) {
            api.start({ height: initialSnapHeight, immediate: false });
            dragStartSnapHeightRef.current = initialSnapHeight;
            currentSnapIndexRef.current = safeInitialIndex;
            dragStartSnapIndexRef.current = safeInitialIndex;
        }
    }, [initialSnapHeight, isMounted, api, safeInitialIndex]);

    // --- Effect to handle external activeSnapIndex changes --- (remains the same)
    useEffect(() => {
        if (
            isMounted &&
            activeSnapIndex !== undefined &&
            activeSnapIndex >= 0 &&
            activeSnapIndex < sortedSnapPoints.length &&
            activeSnapIndex !== currentSnapIndexRef.current
        ) {
            const targetHeight = sortedSnapPoints[activeSnapIndex];
            if (targetHeight !== undefined && targetHeight >= minSnap) {
                api.start({
                    height: targetHeight,
                    immediate: false,
                });
            }
        }
    }, [activeSnapIndex, sortedSnapPoints, isMounted, api, minSnap]); // Removed onSnapChange dependency here as it's not directly used

    useEffect(() => {
        if (
            isMounted &&
            triggerSnapIndex !== undefined &&
            triggerSnapIndex >= 0 && // Check for valid trigger index (not -1)
            triggerSnapIndex < sortedSnapPoints.length
        ) {
            const targetHeight = sortedSnapPoints[triggerSnapIndex];
            if (targetHeight !== undefined && targetHeight >= minSnap) {
                const currentHeight = animatedHeight.get();
                // Only trigger if the target height is different from the current height
                if (Math.abs(currentHeight - targetHeight) > 1) {
                    console.log(`Trigger received for index ${triggerSnapIndex}. Animating to height ${targetHeight}.`);
                    api.start({
                        height: targetHeight,
                        immediate: false, // Ensure animation
                        // config: animationConfig, // Use default or specific config
                        // onRest is already defined globally for the spring
                    });
                } else {
                    console.log(
                        `Trigger received for index ${triggerSnapIndex}, but already at target height ${targetHeight}.`,
                    );
                    // Even if not animating, update internal ref if needed and consume trigger
                    if (currentSnapIndexRef.current !== triggerSnapIndex) {
                        currentSnapIndexRef.current = triggerSnapIndex;
                        onSnapChange?.(triggerSnapIndex);
                    }
                }
                // Consume the trigger immediately after processing it
                onTriggerConsumed?.();
            } else {
                console.warn(
                    `Trigger received for index ${triggerSnapIndex}, but target height ${targetHeight} is invalid. Consuming trigger.`,
                );
                // Consume trigger even if target height is invalid
                onTriggerConsumed?.();
            }
        }
        // Only react when triggerSnapIndex actually changes
    }, [
        triggerSnapIndex,
        isMounted,
        sortedSnapPoints,
        minSnap,
        api,
        onTriggerConsumed,
        animatedHeight,
        onSnapChange, // Added onSnapChange dependency
    ]);

    // --- Drag Handling --- (Simplified version from previous step)
    const dragHandler = useCallback(
        (state: DragState) => {
            const {
                first,
                last,
                memo,
                movement: [, my],
                velocity: [, vy],
                cancel,
                active,
            } = state;

            const pinching = (state as any).pinching;
            const touches = (state as any).touches;

            if (active && (pinching || touches > 1)) {
                if (memo) {
                    api.start({ height: memo.startHeight, immediate: false });
                }
                cancel();
                return;
            }

            if (containerHeight <= 0 || sortedSnapPoints.length === 0) {
                if (active) cancel();
                return;
            }

            if (first) {
                const startHeight = animatedHeight.get();
                let currentClosestSnapIndex = 0;
                let currentClosestSnapHeight = minSnap;
                let minDist = Infinity;
                sortedSnapPoints?.forEach((snapH, index) => {
                    const dist = Math.abs(startHeight - snapH);
                    if (dist < minDist) {
                        minDist = dist;
                        currentClosestSnapHeight = snapH;
                        currentClosestSnapIndex = index;
                    }
                });
                dragStartSnapHeightRef.current = currentClosestSnapHeight;
                dragStartSnapIndexRef.current = currentClosestSnapIndex;
                return { startHeight };
            }

            if (!memo) {
                if (active) cancel();
                return;
            }
            const { startHeight } = memo;

            let newHeight = startHeight - my;
            newHeight = Math.max(minSnap, Math.min(newHeight, maxSnap));

            if (!last) {
                api.start({ height: newHeight, immediate: true });
            } else {
                const distanceMoved = Math.abs(my);
                const startSnapHeight = dragStartSnapHeightRef.current;
                const startIndex = dragStartSnapIndexRef.current;

                let finalTargetHeight: number;
                let finalTargetIndex: number = startIndex;

                if (distanceMoved > moveThreshold) {
                    if (my < 0 && startIndex < sortedSnapPoints.length - 1) {
                        finalTargetIndex = startIndex + 1;
                    } else if (my > 0 && startIndex > 0) {
                        finalTargetIndex = startIndex - 1;
                    }
                    // Use index to get height, default to start height if no move
                    finalTargetHeight = sortedSnapPoints[finalTargetIndex] ?? startSnapHeight;
                } else {
                    finalTargetHeight = startSnapHeight;
                }

                finalTargetHeight = Math.max(minSnap, finalTargetHeight);

                api.start({
                    height: finalTargetHeight,
                    immediate: false,
                    config: { ...animationConfig, velocity: -vy },
                });
            }
        },
        [
            animatedHeight,
            api,
            animationConfig,
            containerHeight,
            maxSnap,
            minSnap,
            moveThreshold,
            sortedSnapPoints,
            // onSnapChange, // onSnapChange is called via onRest, not directly needed here
        ],
    );

    // --- Update useDrag target ---
    useDrag(dragHandler, {
        filterTaps: true,
        preventScroll: false,
        pointer: { touch: true },
        target: touchTargetRef, // <-- Use the new touch target ref
    });

    // --- Render ---
    if (!isMounted || sortedSnapPoints?.length === 0) {
        return null;
    }

    const positionStyle: React.CSSProperties = containerRef?.current
        ? { position: "absolute", bottom: 0, left: 0, right: 0 }
        : { position: "fixed", bottom: 0, left: 0, right: 0 };

    return (
        <AnimatedComponent
            ref={drawerRef}
            className="z-50 flex flex-col rounded-t-lg border-t border-gray-200 bg-white shadow-lg"
            style={{
                ...positionStyle,
                height: animatedHeight,
            }}
        >
            {/* Wrapper div to ensure animated.div has a single child */}
            <div className="flex h-full flex-col">
                {/* Handle Area */}
                {/* Add relative positioning context for the absolute touch target */}
                <div className="relative flex-shrink-0">
                    {/* Larger Invisible Touch Target */}
                    <div
                        ref={touchTargetRef}
                        className="absolute left-0 right-0 cursor-grab touch-none active:cursor-grabbing"
                        style={{
                            top: "-10px", // Extend 16px upwards from the visual handle's container top
                            height: "45px", // Make it 50px tall (adjust as needed)
                            zIndex: 20, // Ensure it's on top within this context
                            // For debugging: Make it visible
                            // backgroundColor: "rgba(255, 0, 0, 0.1)",
                        }}
                        aria-hidden="true" // Hide from accessibility tree
                    />

                    {/* Visual Handle (No interaction needed here) */}
                    {/* Removed ref={handleRef} unless needed elsewhere */}
                    <div className="pointer-events-none flex justify-center py-3">
                        <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                    </div>
                </div>

                {/* Content Area */}
                <div
                    ref={contentRef}
                    className="mb-[72px] mt-[10px] flex-1 overflow-y-auto"
                    style={{
                        // Allow vertical scrolling within the content area itself
                        touchAction: "pan-y",
                    }}
                >
                    {children}
                </div>
            </div>
        </AnimatedComponent>
    );
};

export default ResizingDrawer;

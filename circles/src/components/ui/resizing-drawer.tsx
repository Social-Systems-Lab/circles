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
    activeSnapIndex?: number; // New prop to control snap index externally
    onSnapChange?: (index: number) => void; // Optional: Notify parent on snap change
}

const ResizingDrawer: React.FC<ResizingDrawerProps> = ({
    children,
    snapPoints: rawSnapPoints,
    initialSnapPointIndex = 0,
    containerRef,
    moveThreshold = 50,
    animationConfig = config.stiff,
    activeSnapIndex, // Use this prop
    onSnapChange, // Use this callback
}) => {
    const AnimatedDiv = animated.div;
    const drawerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLDivElement>(null);

    const [containerHeight, setContainerHeight] = useState<number>(
        typeof window !== "undefined" ? window.innerHeight : 0,
    );
    const [isMounted, setIsMounted] = useState(false);

    // --- Container Height Calculation --- (remains the same)
    useEffect(() => {
        // ... (no changes needed here) ...
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
        // ... (no changes needed here) ...
        if (containerHeight <= 0) return [];
        return rawSnapPoints
            .map((p) => {
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
            .sort((a, b) => a - b);
    }, [rawSnapPoints, containerHeight]);

    const minSnap = sortedSnapPoints[0] ?? 0;
    const maxSnap = sortedSnapPoints[sortedSnapPoints.length - 1] ?? 0;

    const safeInitialIndex = useMemo(() => {
        if (sortedSnapPoints.length === 0) return 0;
        return Math.max(0, Math.min(initialSnapPointIndex, sortedSnapPoints.length - 1));
    }, [initialSnapPointIndex, sortedSnapPoints.length]);

    const initialSnapHeight = useMemo(() => {
        if (sortedSnapPoints.length === 0) return 0;
        return Math.max(minSnap, sortedSnapPoints[safeInitialIndex] ?? minSnap);
    }, [sortedSnapPoints, safeInitialIndex, minSnap]);

    // Ref to track the CURRENT snap index based on animation/props
    const currentSnapIndexRef = useRef<number>(safeInitialIndex);
    const dragStartSnapHeightRef = useRef<number>(initialSnapHeight);
    const dragStartSnapIndexRef = useRef<number>(safeInitialIndex);

    // --- Spring Animation ---
    const [{ height: animatedHeight }, api] = useSpring(() => ({
        height: initialSnapHeight > 0 ? initialSnapHeight : 0,
        config: animationConfig,
        onRest: (result) => {
            // When animation finishes, determine the new current index
            if (!result.cancelled) {
                const finalHeight = result.value.height;
                let closestIndex = 0;
                let minDist = Infinity;
                sortedSnapPoints.forEach((snapH, index) => {
                    const dist = Math.abs(finalHeight - snapH);
                    // Add a small tolerance for floating point comparisons
                    if (dist < minDist && dist < 1) {
                        minDist = dist;
                        closestIndex = index;
                    }
                });
                if (currentSnapIndexRef.current !== closestIndex) {
                    currentSnapIndexRef.current = closestIndex;
                    onSnapChange?.(closestIndex); // Notify parent if index changed
                }
            }
        },
    }));

    // --- Effect for Initial Height --- (remains the same)
    useEffect(() => {
        if (isMounted && initialSnapHeight > 0) {
            api.start({ height: initialSnapHeight, immediate: false });
            dragStartSnapHeightRef.current = initialSnapHeight;
            currentSnapIndexRef.current = safeInitialIndex; // Set initial current index
            dragStartSnapIndexRef.current = safeInitialIndex;
        }
    }, [initialSnapHeight, isMounted, api, safeInitialIndex]);

    // --- Effect to handle external activeSnapIndex changes ---
    useEffect(() => {
        if (
            isMounted &&
            activeSnapIndex !== undefined &&
            activeSnapIndex >= 0 &&
            activeSnapIndex < sortedSnapPoints.length &&
            activeSnapIndex !== currentSnapIndexRef.current // Only trigger if different
        ) {
            const targetHeight = sortedSnapPoints[activeSnapIndex];
            // Check if targetHeight is valid before animating
            if (targetHeight !== undefined && targetHeight >= minSnap) {
                api.start({
                    height: targetHeight,
                    immediate: false, // Animate the change
                    // onRest callback will update currentSnapIndexRef
                });
            }
        }
        // Depend on activeSnapIndex and sortedSnapPoints (as they determine targetHeight)
    }, [activeSnapIndex, sortedSnapPoints, isMounted, api, minSnap]);

    // --- Drag Handling ---
    const dragHandler = useCallback(
        (state: DragState) => {
            // ... (drag logic remains the same as previous correct version) ...
            const {
                first,
                last,
                memo,
                movement: [, my],
                velocity: [, vy],
                direction: [, dy],
                cancel,
                event,
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
                sortedSnapPoints.forEach((snapH, index) => {
                    const dist = Math.abs(startHeight - snapH);
                    if (dist < minDist) {
                        minDist = dist;
                        currentClosestSnapHeight = snapH;
                        currentClosestSnapIndex = index;
                    }
                });
                dragStartSnapHeightRef.current = currentClosestSnapHeight;
                dragStartSnapIndexRef.current = currentClosestSnapIndex; // Use the calculated index

                const target = event?.target as HTMLElement;
                const contentEl = contentRef.current;
                let cancelDrag = false;
                if (target && contentEl && contentEl.contains(target)) {
                    const isScrollable = contentEl.scrollHeight > contentEl.clientHeight;
                    if (isScrollable) {
                        const isAtTop = contentEl.scrollTop <= 0;
                        const isAtBottom = contentEl.scrollTop >= contentEl.scrollHeight - contentEl.clientHeight - 1;
                        if (!handleRef.current?.contains(target)) {
                            if (dy > 0 && !isAtTop) cancelDrag = true;
                            if (dy < 0 && !isAtBottom) cancelDrag = true;
                        }
                    }
                }
                if (cancelDrag) {
                    cancel();
                    return { startHeight };
                }
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
                const startIndex = dragStartSnapIndexRef.current; // Use the stored start index

                let finalTargetHeight: number;
                let finalTargetIndex: number = startIndex; // Keep track of target index

                if (distanceMoved > moveThreshold) {
                    if (my < 0 && startIndex < sortedSnapPoints.length - 1) {
                        finalTargetIndex = startIndex + 1;
                        finalTargetHeight = sortedSnapPoints[finalTargetIndex];
                    } else if (my > 0 && startIndex > 0) {
                        finalTargetIndex = startIndex - 1;
                        finalTargetHeight = sortedSnapPoints[finalTargetIndex];
                    } else {
                        finalTargetHeight = startSnapHeight;
                        // finalTargetIndex remains startIndex
                    }
                } else {
                    finalTargetHeight = startSnapHeight;
                    // finalTargetIndex remains startIndex
                }

                finalTargetHeight = Math.max(minSnap, finalTargetHeight);

                // Update ref immediately for next potential external change check
                // currentSnapIndexRef.current = finalTargetIndex;
                // Let onRest handle the final index update

                api.start({
                    height: finalTargetHeight,
                    immediate: false,
                    config: { ...animationConfig, velocity: -vy },
                    // onRest callback will update currentSnapIndexRef and call onSnapChange
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
            onSnapChange, // Add callback to dependencies
        ],
    );

    useDrag(dragHandler, {
        filterTaps: true,
        axis: "y",
        preventScroll: true,
        pointer: { touch: true },
        target: handleRef,
    });

    // --- Render --- (remains the same)
    if (!isMounted || sortedSnapPoints.length === 0) {
        return null;
    }

    const positionStyle: React.CSSProperties = containerRef?.current
        ? { position: "absolute", bottom: 0, left: 0, right: 0 }
        : { position: "fixed", bottom: 0, left: 0, right: 0 };

    return (
        <AnimatedDiv
            ref={drawerRef}
            className="z-50 flex flex-col overflow-hidden rounded-t-lg border-t border-gray-200 bg-white shadow-lg"
            style={{
                ...positionStyle,
                height: animatedHeight,
            }}
        >
            {/* Handle */}
            <div ref={handleRef} className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing">
                <div className="h-1.5 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Content Area */}
            <div
                ref={contentRef}
                className="flex-1 overflow-y-auto"
                style={{
                    touchAction: "pan-y",
                }}
            >
                {children}
            </div>
        </AnimatedDiv>
    );
};

export default ResizingDrawer;

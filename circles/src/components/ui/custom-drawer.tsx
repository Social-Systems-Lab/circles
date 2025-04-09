// custom-drawer.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useDrag, DragState } from "@use-gesture/react";
import { animated, useSpring, config, SpringValue, Interpolation } from "@react-spring/web";

interface CustomDrawerProps {
    children: React.ReactNode;
    snapPoints: number[]; // Heights in pixels from bottom (e.g., [100, 400, window.innerHeight * 0.8])
    initialSnapPointIndex?: number; // Index in the provided snapPoints array
    onDismiss?: () => void;
    open?: boolean; // Control open state externally
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode; // Optional trigger element
    modal?: boolean; // Determines if overlay is shown
    snapThreshold?: number; // Pixel distance threshold from RELEASE point to target snap point (default: 50)
    fadeFromIndex?: number; // Snap point index (in original snapPoints) from which the overlay starts fading in (default: 0)
    animationConfig?: object; // Allow overriding spring config
}

const CustomDrawer: React.FC<CustomDrawerProps> = ({
    children,
    snapPoints,
    initialSnapPointIndex = 0,
    onDismiss,
    open: controlledOpen,
    onOpenChange,
    trigger,
    modal = true,
    snapThreshold = 50,
    fadeFromIndex = 0, // Default fade starts from lowest open snap point
    animationConfig = config.stiff, // Default to a stiffer spring
}) => {
    const AnimatedDiv = animated.div; // Use animated factory
    const height = window.innerHeight; // Use window height for calculations

    // Ensure snap points are valid numbers and add 0 for closed state, then sort
    const sortedSnapPoints = useMemo(
        () => [...snapPoints.filter((p) => typeof p === "number" && p > 0), 0].sort((a, b) => a - b),
        [snapPoints],
    );

    const minSnap = sortedSnapPoints[1] ?? 0; // Smallest open snap point (or 0 if none)
    const maxSnap = sortedSnapPoints[sortedSnapPoints.length - 1] ?? 0; // Largest snap point

    // Map initialSnapPointIndex to the sorted array index (+1 because 0 is closed)
    const initialSortedIndex = useMemo(() => {
        const initialValue = snapPoints[initialSnapPointIndex];
        const idx = sortedSnapPoints.findIndex((p) => p === initialValue);
        return Math.max(1, idx); // Default to index 1 (lowest open) if not found or invalid
    }, [snapPoints, initialSnapPointIndex, sortedSnapPoints]);

    const isControlled = controlledOpen !== undefined;
    const [isOpenInternal, setIsOpenInternal] = useState(controlledOpen ?? false); // Default to closed if uncontrolled
    const isOpen = isControlled ? controlledOpen : isOpenInternal;

    // Store the snap index *before* a drag starts
    const dragStartSnapIndexRef = useRef<number>(isOpen ? initialSortedIndex : 0);
    // Store the current snap index
    const currentSnapIndexRef = useRef<number>(isOpen ? initialSortedIndex : 0);

    const [{ y }, api] = useSpring(() => ({
        // Initial position: closed (y=height) or at initial snap point
        y: isOpen ? height - sortedSnapPoints[initialSortedIndex] : height,
        config: animationConfig,
        onRest: () => {
            // Update internal state when animation finishes if uncontrolled
            if (!isControlled) {
                const currentY = y.get();
                const isActuallyOpen = currentY < height;
                if (isActuallyOpen !== isOpenInternal) {
                    setIsOpenInternal(isActuallyOpen);
                }
            }
        },
    }));

    const drawerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false); // Track drag state

    // --- State Synchronization ---

    // Effect to handle controlled open/close changes
    useEffect(() => {
        if (isControlled) {
            const targetIndex = controlledOpen
                ? currentSnapIndexRef.current > 0
                    ? currentSnapIndexRef.current // Restore last known open index
                    : initialSortedIndex // Or open to initial index
                : 0; // Close

            const targetY = height - sortedSnapPoints[targetIndex];
            api.start({
                y: targetY,
                immediate: false,
                config: animationConfig,
                onRest: () => {
                    currentSnapIndexRef.current = targetIndex; // Update ref after animation
                },
            });
        }
    }, [controlledOpen, isControlled, api, height, sortedSnapPoints, initialSortedIndex, animationConfig]);

    // --- Actions ---

    const openDrawer = useCallback(
        (snapIndex = initialSortedIndex) => {
            const targetIndex = Math.max(1, snapIndex); // Ensure we open to at least index 1
            const targetY = height - sortedSnapPoints[targetIndex];
            currentSnapIndexRef.current = targetIndex; // Update immediately for logic
            dragStartSnapIndexRef.current = targetIndex; // Update drag start ref as well

            api.start({
                y: targetY,
                immediate: false,
                config: animationConfig,
                onRest: () => {
                    if (!isControlled) setIsOpenInternal(true);
                    onOpenChange?.(true);
                },
            });
        },
        [api, height, sortedSnapPoints, initialSortedIndex, isControlled, onOpenChange, animationConfig],
    );

    const closeDrawer = useCallback(
        (velocity = 0) => {
            currentSnapIndexRef.current = 0; // Update immediately for logic
            dragStartSnapIndexRef.current = 0; // Update drag start ref

            api.start({
                y: height,
                immediate: false,
                config: { ...animationConfig, velocity },
                onRest: () => {
                    if (!isControlled) setIsOpenInternal(false);
                    onOpenChange?.(false);
                    onDismiss?.();
                },
            });
        },
        [api, height, onDismiss, isControlled, onOpenChange, animationConfig],
    );

    // --- Drag Handling ---

    const bind = useDrag(
        ({
            first,
            last,
            memo, // Use memo to store drag start info
            movement: [, my],
            velocity: [, vy],
            direction: [, dy],
            cancel,
            event,
            tap, // Detect taps
        }: Omit<DragState, "event"> & { event: PointerEvent | TouchEvent }) => {
            // Handle taps on the handle/drawer background to cycle snaps or close
            if (tap) {
                // Example tap behavior: cycle up or close if at max snap
                // You might want different tap behavior (e.g., always open to initial)
                const currentIndex = currentSnapIndexRef.current;
                if (currentIndex === 0) {
                    openDrawer(initialSortedIndex);
                } else if (currentIndex < sortedSnapPoints.length - 1) {
                    openDrawer(currentIndex + 1);
                } else {
                    closeDrawer();
                }
                return; // Don't process tap as drag
            }

            // Initialize memo on first drag event
            if (first) {
                isDraggingRef.current = true;
                const startY = y.get();
                const startSnapIndex = currentSnapIndexRef.current;
                dragStartSnapIndexRef.current = startSnapIndex; // Store index at drag start

                // --- Scroll Prevention Logic ---
                const target = event.target as HTMLElement;
                const contentEl = contentRef.current;
                let cancelDrag = false;

                // Check if drag started within the scrollable content area
                if (contentEl && contentEl.contains(target)) {
                    const isScrollable = contentEl.scrollHeight > contentEl.clientHeight;
                    if (isScrollable) {
                        // If scrolling down (dy > 0) but already at the top, allow drag
                        // If scrolling up (dy < 0) but already at the bottom, allow drag
                        const isAtTop = contentEl.scrollTop <= 0;
                        const isAtBottom = contentEl.scrollTop >= contentEl.scrollHeight - contentEl.clientHeight - 1; // Allow 1px tolerance

                        if (dy > 0 && !isAtTop) cancelDrag = true; // Trying to scroll down content
                        if (dy < 0 && !isAtBottom) cancelDrag = true; // Trying to scroll up content
                    }
                }

                if (cancelDrag) {
                    cancel(); // Cancel the drag gesture to allow native scrolling
                    isDraggingRef.current = false;
                    return { startY, startSnapIndex }; // Return memo structure
                }
                // --- End Scroll Prevention ---

                return { startY, startSnapIndex }; // Store start values in memo
            }

            // Guard against undefined memo (shouldn't happen after 'first')
            if (!memo) return;
            const { startY, startSnapIndex } = memo;

            let newY = startY + my;

            // Clamp position during drag: prevent dragging below closed state or above max snap point
            newY = Math.max(height - maxSnap, Math.min(newY, height));

            // Update position during drag (immediate for responsiveness)
            if (!last) {
                api.start({ y: newY, immediate: true });
            }
            // --- Release Logic ---
            else {
                isDraggingRef.current = false;
                const currentY = y.get(); // Get the actual current position from the spring
                const releaseHeight = height - currentY; // Actual height when released
                const projectedY = currentY + vy * 200; // Project end position with velocity
                const projectedHeight = height - projectedY;

                // --- Find Target Snap Point ---
                // Find the closest snap point to the *projected* height
                let targetSnapIndex = 0;
                let minDistance = Infinity;
                sortedSnapPoints.forEach((snapHeight, index) => {
                    const dist = Math.abs(projectedHeight - snapHeight);
                    if (dist < minDistance) {
                        minDistance = dist;
                        targetSnapIndex = index;
                    }
                });

                // --- Snap vs. Return Logic ---
                const distanceToTargetSnap = Math.abs(releaseHeight - sortedSnapPoints[targetSnapIndex]);

                if (distanceToTargetSnap <= snapThreshold) {
                    // Within threshold: Snap to the determined target
                    if (targetSnapIndex === 0) {
                        // If target is closed, close the drawer
                        closeDrawer(vy);
                    } else {
                        // Snap to the target open snap point
                        currentSnapIndexRef.current = targetSnapIndex; // Update ref
                        api.start({
                            y: height - sortedSnapPoints[targetSnapIndex],
                            immediate: false,
                            config: { ...animationConfig, velocity: vy },
                        });
                        if (!isControlled) setIsOpenInternal(true);
                        onOpenChange?.(true);
                    }
                } else {
                    // Outside threshold: Snap back to the point where the drag started
                    // Ensure it snaps back to at least the minimum open state if it was open before
                    const returnSnapIndex = startSnapIndex > 0 ? startSnapIndex : 1;
                    if (returnSnapIndex === 0) {
                        // Should not happen if startSnapIndex > 0 check is correct, but safety check
                        closeDrawer(vy);
                    } else {
                        currentSnapIndexRef.current = returnSnapIndex; // Update ref
                        api.start({
                            y: height - sortedSnapPoints[returnSnapIndex],
                            immediate: false,
                            config: { ...animationConfig, velocity: vy },
                        });
                        if (!isControlled) setIsOpenInternal(true);
                        onOpenChange?.(true);
                    }
                }
            }
        },
        {
            from: () => [0, y.get()], // Start drag from current spring value
            filterTaps: true, // Enable tap detection
            axis: "y",
            preventScroll: true, // Prevent page scroll during drag
            // delay: 100, // Optional small delay to distinguish scroll/drag
            // bounds: { top: height - maxSnap, bottom: height }, // Can be useful
            // rubberband: 0.2, // Optional rubberbanding
            pointer: { touch: true }, // Ensure touch events are captured
        },
    );

    // --- Event Handlers ---

    const handleTriggerClick = () => {
        const currentY = y.get();
        if (currentY >= height) {
            // If currently closed or closing
            openDrawer();
        } else {
            // If currently open or opening
            closeDrawer();
        }
    };

    // --- Style Calculations ---

    // Calculate overlay opacity based on current position and fadeFromIndex
    const overlayOpacity = y.to(
        (val: number) => {
            // Ensure fadeFromIndex is valid, default to 0 (first snap point)
            const safeFadeIndex = fadeFromIndex >= 0 && fadeFromIndex < snapPoints.length ? fadeFromIndex : 0;
            // Find the corresponding height in sortedSnapPoints
            const fadeStartSnapValue = snapPoints[safeFadeIndex] ?? minSnap;
            const fadeStartY = height - fadeStartSnapValue; // Y value where fade starts

            // Ensure fadeStartY is below the closed position (height)
            const rangeStart = Math.min(fadeStartY, height - 1); // Start fade just below closed

            return modal ? Math.max(0, Math.min(0.5, 0.5 * (1 - (val - rangeStart) / (height - rangeStart)))) : 0;
        },
        // Alternative simpler interpolation:
        // {
        //     range: [height - minSnap, height], // Fade in as it moves from closed to minSnap
        //     output: [modal ? 0.5 : 0, 0], // Max opacity 0.5 if modal, 0 otherwise
        //     extrapolate: 'clamp',
        // }
    );

    // Calculate drawer's visible height for content scrolling
    const drawerVisibleHeight: Interpolation<number, number> = y.to(
        (val: number) => Math.max(0, height - val), // Ensure non-negative height
    );

    // --- Render ---

    // Don't render if closed, uncontrolled, and no trigger provided
    if (!isOpen && !isControlled && !trigger) {
        return null;
    }

    return (
        <>
            {/* Trigger Element */}
            {trigger &&
                React.isValidElement(trigger) &&
                React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
                    onClick: handleTriggerClick,
                })}

            {/* Portal or direct render depending on needs - Direct render shown */}
            {/* Use visibility: hidden when closed but controlled, to keep it in DOM */}
            <div
                style={{
                    visibility: isOpen || isDraggingRef.current ? "visible" : "hidden",
                    // Use pointerEvents none when fully closed to avoid blocking interactions
                    pointerEvents: isOpen || isDraggingRef.current ? "auto" : "none",
                }}
                className="bg-blue-100"
            >
                {/* Overlay */}
                {modal && (
                    <AnimatedDiv
                        className="fixed inset-0 z-40 bg-black" // Adjust z-index as needed
                        style={{
                            opacity: overlayOpacity,
                            // Prevent interaction when drawer is closed or closing
                            pointerEvents: isOpen || isDraggingRef.current ? "auto" : "none",
                            touchAction: "none",
                        }}
                        onClick={() => {
                            if (isOpen) closeDrawer();
                        }} // Close on overlay click
                    />
                )}

                {/* Drawer Container */}
                <AnimatedDiv
                    ref={drawerRef}
                    // Spread gesture handlers onto the main drawer element
                    // This allows dragging from the background/padding of the drawer too
                    {...bind()}
                    className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-lg border-t border-gray-200 bg-white shadow-lg" // Example styling
                    style={{
                        y,
                        // Set a static height based on the largest snap point
                        // Content inside will scroll if it exceeds the *visible* height
                        height: maxSnap > 0 ? maxSnap : "auto", // Use maxSnap or auto if no snaps
                        minHeight: minSnap > 0 ? minSnap : 50, // Optional min-height
                        transformOrigin: "bottom",
                        // Apply touch-action: none to the element receiving drag gestures
                        touchAction: "none",
                        // Use visibility controlled by the outer div
                        // visibility: y.to(val => (val >= height ? 'hidden' : 'visible')),
                    }}
                >
                    {/* Handle */}
                    <div
                        // Optionally bind gestures ONLY to the handle: {...bind()}
                        // If bound here, remove {...bind()} from the parent AnimatedDiv
                        className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing" // Increased padding for easier grabbing
                        // Prevent event propagation if handle is separate drag target
                        // onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                    </div>

                    {/* Content Area */}
                    <AnimatedDiv
                        ref={contentRef}
                        className="flex-1 overflow-y-auto" // flex-1 makes it take remaining space
                        style={{
                            // Calculate the maximum height the content area can occupy
                            // based on the drawer's current animated visible height.
                            height: drawerVisibleHeight,
                            // Allow touch scrolling specifically on the content
                            touchAction: "pan-y",
                        }}
                    >
                        {children}
                    </AnimatedDiv>
                </AnimatedDiv>
            </div>
        </>
    );
};

export default CustomDrawer;

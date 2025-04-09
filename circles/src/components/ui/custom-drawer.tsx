import React, { useState, useRef, useEffect, useCallback } from "react";
import { useDrag, DragState } from "@use-gesture/react";
import { animated, useSpring, config, SpringValue, Interpolation } from "@react-spring/web";

interface CustomDrawerProps {
    children: React.ReactNode;
    snapPoints: number[]; // Heights in pixels or percentages (e.g., [100, 400, window.innerHeight * 0.8])
    initialSnapPointIndex?: number;
    onDismiss?: () => void;
    open?: boolean; // Control open state externally
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode; // Optional trigger element
    modal?: boolean; // Determines if overlay is shown
    closeThreshold?: number; // Percentage of drag down to dismiss (0 to 1)
    fadeFromIndex?: number; // Snap point index from which the overlay starts fading in
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
    closeThreshold = 0.5,
}) => {
    const AnimatedDiv = animated("div"); // Explicitly create animated component
    const [isOpen, setIsOpen] = useState(controlledOpen ?? true); // Internal open state if not controlled
    const height = window.innerHeight; // Use window height for calculations
    const sortedSnapPoints = [...snapPoints, 0].sort((a, b) => a - b); // Add 0 for closed state and sort
    const minSnap = sortedSnapPoints[1]; // Smallest open snap point
    const maxSnap = sortedSnapPoints[sortedSnapPoints.length - 1]; // Largest snap point

    const [currentSnapIndex, setCurrentSnapIndex] = useState(
        Math.max(1, initialSnapPointIndex + 1), // +1 because 0 is the closed state
    );

    const [{ y }, api] = useSpring(() => ({
        y: height - sortedSnapPoints[currentSnapIndex],
        config: config.stiff,
    }));

    const drawerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const isControlled = controlledOpen !== undefined;

    // Sync internal state with controlled prop
    useEffect(() => {
        if (isControlled) {
            setIsOpen(controlledOpen);
            if (controlledOpen) {
                // Open to initial or last known snap point
                const targetSnapIndex =
                    currentSnapIndex > 0 ? currentSnapIndex : Math.max(1, initialSnapPointIndex + 1);
                api.start({ y: height - sortedSnapPoints[targetSnapIndex], immediate: false });
                setCurrentSnapIndex(targetSnapIndex);
            } else {
                // Close
                api.start({ y: height, immediate: false });
                setCurrentSnapIndex(0);
            }
        }
    }, [controlledOpen, isControlled, api, height, sortedSnapPoints, initialSnapPointIndex, currentSnapIndex]);

    const openDrawer = useCallback(
        (snapIndex = Math.max(1, initialSnapPointIndex + 1)) => {
            const targetY = height - sortedSnapPoints[snapIndex];
            api.start({ y: targetY, immediate: false });
            setCurrentSnapIndex(snapIndex);
            if (!isControlled) setIsOpen(true);
            onOpenChange?.(true);
        },
        [api, height, sortedSnapPoints, initialSnapPointIndex, isControlled, onOpenChange],
    );

    const closeDrawer = useCallback(() => {
        api.start({ y: height, immediate: false });
        setCurrentSnapIndex(0);
        if (!isControlled) setIsOpen(false);
        onOpenChange?.(false);
        onDismiss?.();
    }, [api, height, onDismiss, isControlled, onOpenChange]);

    const bind = useDrag(
        ({
            last,
            velocity: [, vy],
            direction: [, dy],
            movement: [, my],
            cancel,
            canceled,
            first,
            event,
        }: Omit<DragState, "event"> & { event: PointerEvent | TouchEvent }) => {
            // Add types here
            // Prevent page scroll
            if (first) {
                // Check if drag started on the content area and if it's scrollable
                const target = event.target as HTMLElement;
                const contentEl = contentRef.current;
                if (contentEl && contentEl.contains(target)) {
                    // If content is scrollable and user is trying to scroll, cancel drag
                    if (contentEl.scrollHeight > contentEl.clientHeight && contentEl.scrollTop > 0 && dy > 0) {
                        // Scrolling down
                        // Allow native scroll
                        return;
                    }
                    if (
                        contentEl.scrollHeight > contentEl.clientHeight &&
                        contentEl.scrollTop < contentEl.scrollHeight - contentEl.clientHeight &&
                        dy < 0
                    ) {
                        // Scrolling up
                        // Allow native scroll
                        return;
                    }
                }
            }

            const currentY = y.get();
            let newY = currentY + my;

            // Clamp newY to prevent dragging beyond limits
            newY = Math.max(height - maxSnap, newY); // Don't drag above max snap
            newY = Math.min(height, newY); // Don't drag below closed position

            if (last) {
                const projectedY = currentY + my + vy * 200; // Project future position
                const currentHeight = height - currentY - my;
                const targetHeight = height - projectedY;

                // Determine the closest snap point
                let closestSnapIndex = 0;
                let minDistance = Infinity;

                sortedSnapPoints.forEach((snap, index) => {
                    const dist = Math.abs(targetHeight - snap);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestSnapIndex = index;
                    }
                });

                // Dismissal logic
                const dragDownDistance = my;
                const currentSnapHeight = sortedSnapPoints[currentSnapIndex];
                const dismissThresholdPixels = currentSnapHeight * closeThreshold;

                if (dragDownDistance > dismissThresholdPixels && dy > 0 && currentSnapIndex > 0) {
                    // If dragged down significantly, close
                    closeDrawer();
                } else if (closestSnapIndex === 0 && currentSnapIndex > 0) {
                    // If the closest snap is closed, but didn't meet threshold, snap back to min open
                    openDrawer(1);
                } else {
                    // Snap to the closest point
                    openDrawer(closestSnapIndex);
                }
            } else {
                // Update position during drag
                api.start({ y: newY, immediate: true });
            }
        },
        {
            from: () => [0, y.get()],
            filterTaps: true,
            axis: "y",
            preventScroll: true, // Prevent page scroll during drag
            // delay: 200, // Optional delay
            // bounds: { top: height - maxSnap, bottom: height }, // Bounds based on snap points
            // rubberband: 0.2, // Optional rubberbanding effect
        },
    );

    // Handle trigger click
    const handleTriggerClick = () => {
        if (isOpen) {
            closeDrawer();
        } else {
            openDrawer();
        }
    };

    // Calculate overlay opacity based on current position
    const overlayOpacity = y.to({
        range: [height - minSnap, height], // Fade in as it moves from closed to minSnap
        output: [modal ? 0.5 : 0, 0], // Max opacity 0.5 if modal, 0 otherwise
        extrapolate: "clamp",
    });

    // Calculate drawer height for content scrolling
    const drawerVisibleHeight: Interpolation<number, number> = y.to((val: number) => height - val); // Correct type here

    if (!isOpen && !isControlled && !trigger) return null; // Don't render if closed, uncontrolled, and no trigger

    return (
        <>
            {trigger &&
                React.isValidElement(trigger) &&
                React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
                    onClick: handleTriggerClick,
                })}
            {isOpen && (
                <>
                    {modal && (
                        <AnimatedDiv // Use the explicit component
                            className="pointer-events-none fixed inset-0 z-[100] bg-black" // Pass className directly
                            style={{ opacity: overlayOpacity, touchAction: "none" }} // Only animated styles here
                            onClick={closeDrawer} // Pass onClick directly
                        /> // Ensure self-closing or proper closing tag
                    )}
                    <AnimatedDiv // Use the explicit component
                        ref={drawerRef} // Pass ref directly
                        {...bind()} // Spread gesture handlers directly
                        className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col rounded-t-lg border-t border-border bg-blue-100 shadow-lg" // Pass className directly
                        style={{
                            // Only animated styles here
                            y,
                            height: maxSnap, // Static max height
                            transformOrigin: "bottom",
                            touchAction: "none", // CSS property
                        }}
                    >
                        {/* Handler */}
                        <div className="flex cursor-grab touch-none justify-center py-2 active:cursor-grabbing">
                            <div className="h-1.5 w-12 rounded-full bg-muted" />
                        </div>
                        {/* Content */}
                        <AnimatedDiv // Use the explicit component
                            ref={contentRef} // Pass ref directly
                            className="flex-grow overflow-y-auto" // Pass className directly
                            style={{ height: drawerVisibleHeight }} // Only animated styles here
                        >
                            {children}
                        </AnimatedDiv>{" "}
                        {/* Add the closing tag */}
                    </AnimatedDiv>{" "}
                    {/* Add the closing tag */}
                </>
            )}
        </>
    );
};

export default CustomDrawer;

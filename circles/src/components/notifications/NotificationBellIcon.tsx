"use client";

import React from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

// Extend Button props to ensure compatibility with PopoverTrigger asChild
// Omit 'children' as NotificationBellIcon provides its own child (the Bell icon).
// Also omit 'size' from ButtonProps to avoid conflict, we'll use iconSize for the Bell.
interface NotificationBellIconProps extends Omit<React.ComponentPropsWithoutRef<typeof Button>, "children" | "size"> {
    iconSize?: number; // Renamed from 'size' to avoid conflict with Button's 'size' prop
}

export const NotificationBellIcon: React.FC<NotificationBellIconProps> = ({
    onClick,
    className,
    iconSize = 20, // Default size for the Bell icon
    ...props // Spread other props (like those from PopoverTrigger)
}) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        console.log("NotificationBellIcon internal handleClick. Event target:", event.target);
        if (onClick) {
            onClick(event); // Forward the event to the passed onClick handler
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon" // Explicitly set Button's own size prop to "icon"
            onClick={handleClick} // Use the internal handleClick that forwards the event
            className={className}
            aria-label="Notification settings"
            {...props} // Spread the rest of the props to the Button
        >
            <Bell size={iconSize} /> {/* Use iconSize for the lucide-icon */}
        </Button>
    );
};

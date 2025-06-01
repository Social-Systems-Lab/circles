"use client";

import React from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationBellIconProps {
    onClick: () => void;
    className?: string;
    size?: number;
}

export const NotificationBellIcon: React.FC<NotificationBellIconProps> = ({ onClick, className, size = 20 }) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        console.log("NotificationBellIcon clicked. Event target:", event.target);
        onClick();
    };
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            className={className}
            aria-label="Notification settings"
        >
            <Bell size={size} />
        </Button>
    );
};

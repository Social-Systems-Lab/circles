import React from "react";
import { Circle, CircleType } from "@/models/models";
import { Circle as CircleIcon, User, Hammer } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";

interface CircleTypeIndicatorProps {
    circleType: CircleType;
    className?: string;
    size?: string;
}

export function CircleTypeIndicator({ circleType, className = "", size = "24px" }: CircleTypeIndicatorProps) {
    const getTypeConfig = () => {
        switch (circleType) {
            case "circle":
                return {
                    icon: <CircleIcon className="h-full w-full" />,
                    color: "#495cff", // Primary blue color
                    label: "Circle",
                    description: "A community or organization"
                };
            case "user":
                return {
                    icon: <User className="h-full w-full" />,
                    color: "#22c3ac", // Teal color
                    label: "User",
                    description: "Individual profile"
                };
            case "project":
                return {
                    icon: <Hammer className="h-full w-full" />,
                    color: "#c32267", // Pink/magenta color
                    label: "Project",
                    description: "A specific initiative or project"
                };
            default:
                return {
                    icon: <CircleIcon className="h-full w-full" />,
                    color: "#495cff",
                    label: "Unknown",
                    description: "Unknown type"
                };
        }
    };

    const config = getTypeConfig();

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div 
                    className={`flex items-center justify-center rounded-full ${className}`}
                    style={{ 
                        width: size, 
                        height: size, 
                        backgroundColor: config.color,
                        color: "white",
                    }}
                >
                    {config.icon}
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="z-[500] w-[200px] p-2 pt-[6px] text-[14px]">
                <p>
                    <span className="mr-1 inline-block h-5 w-5" style={{ color: config.color }}>
                        {config.icon}
                    </span>
                    <b>{config.label}:</b> {config.description}
                </p>
            </HoverCardContent>
        </HoverCard>
    );
}

export default CircleTypeIndicator;
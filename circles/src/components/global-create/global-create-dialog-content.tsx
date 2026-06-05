"use client";

import React from "react";
import { DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Card, CardTitle } from "@/components/ui/card";
import {
    Users,
    ListChecks,
    Target,
    MessageSquare,
    AlertTriangle,
    FileText,
    ChevronRight,
    Calendar,
    Hammer,
} from "lucide-react";

// Define types for creatable items
export type CreatableItemKey =
    | "community"
    | "project"
    | "task"
    | "goal"
    | "post"
    | "issue"
    | "proposal"
    | "event"
    | "discussion";

const visibleGlobalCreateItemKeys: CreatableItemKey[] = ["community", "post", "event", "goal"];

export interface CreatableItemDetail {
    key: CreatableItemKey;
    title: string;
    description: string;
    icon?: React.ElementType; // Made icon optional
    moduleHandle: string; // Un-commented
    createFeatureHandle: string; // Un-commented
}

// Define the items that can be created
export const creatableItemsList: CreatableItemDetail[] = [
    // Added export
    {
        key: "community",
        title: "Circle",
        description: "Start a new circle or group.",
        icon: Users,
        moduleHandle: "communities",
        createFeatureHandle: "create",
    },
    {
        key: "project",
        title: "Project",
        description: "Launch a new project.",
        icon: Hammer,
        moduleHandle: "projects",
        createFeatureHandle: "create",
    },
    {
        key: "post",
        title: "Post",
        description: "Share a post, update, or story.",
        icon: MessageSquare,
        moduleHandle: "feed",
        createFeatureHandle: "post",
    },
    {
        key: "task",
        title: "Task",
        description: "Define a new task to be done.",
        icon: ListChecks,
        moduleHandle: "tasks",
        createFeatureHandle: "create",
    },
    {
        key: "goal",
        title: "Goal",
        description: "Set a new goal to achieve.",
        icon: Target,
        moduleHandle: "goals",
        createFeatureHandle: "create",
    },
    {
        key: "issue",
        title: "Issue",
        description: "Report a new issue or problem.",
        icon: AlertTriangle,
        moduleHandle: "issues",
        createFeatureHandle: "create",
    },
    {
        key: "proposal",
        title: "Proposal",
        description: "Make a new proposal for decision.",
        icon: FileText,
        moduleHandle: "proposals",
        createFeatureHandle: "create",
    },
    {
        key: "event",
        title: "Event",
        description: "Schedule a new event.",
        icon: Calendar,
        moduleHandle: "events",
        createFeatureHandle: "create",
    },
    // {
    //     key: "discussion",
    //     title: "Discussion",
    //     description: "Start a new discussion thread.",
    //     icon: MessageSquare,
    //     moduleHandle: "discussions",
    //     createFeatureHandle: "create",
    // },
];

interface GlobalCreateDialogContentProps {
    onCloseMainDialog: () => void; // To close this selection dialog
    onSelectItemType: (itemKey: CreatableItemKey) => void; // New prop to inform parent of selection
    setCreateCommunityOpen: (open: boolean) => void;
    setCreateProjectOpen: (open: boolean) => void;
}

export const GlobalCreateDialogContent: React.FC<GlobalCreateDialogContentProps> = ({
    onCloseMainDialog,
    onSelectItemType,
    setCreateCommunityOpen,
    setCreateProjectOpen,
}) => {
    const visibleCreatableItems = creatableItemsList.filter((item) => visibleGlobalCreateItemKeys.includes(item.key));

    const handleItemClick = (itemKey: CreatableItemKey) => {
        onCloseMainDialog(); // Close this selection dialog

        if (itemKey === "community") {
            setCreateCommunityOpen(true);
        } else if (itemKey === "project") {
            setCreateProjectOpen(true);
        } else {
            // For other items, notify the parent to open the specific dialog
            onSelectItemType(itemKey);
        }
    };

    return (
        <div className="formatted">
            <DialogHeader className="p-6 pb-4 text-center md:text-left">
                <DialogTitle className="text-2xl font-bold">Create</DialogTitle>
                <DialogDescription className="text-base text-muted-foreground">
                    What would you like to create?
                </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 p-6 pt-2 md:grid-cols-2">
                {visibleCreatableItems.map((item) => (
                    <Card
                        key={item.key}
                        onClick={() => handleItemClick(item.key)}
                        className="group flex cursor-pointer flex-row items-center gap-4 rounded-2xl border border-[#e8dfd3] bg-[#fcfbf8] p-4 shadow-sm transition-all duration-200 hover:border-[#d9cbb6] hover:bg-white hover:shadow-md"
                    >
                        <div
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-[#e3d8ca] bg-[#f5efe6] text-[#7b6750]"
                        >
                            {item.icon && <item.icon className="h-6 w-6" />} {/* Conditionally render icon */}
                        </div>
                        <div className="flex-grow">
                            <CardTitle className="text-lg font-semibold text-[#3b352f]">{item.title}</CardTitle>
                            <p className="text-sm text-[#746b60]">{item.description}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-[#9d8f80] transition-transform group-hover:translate-x-1" />
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default GlobalCreateDialogContent;

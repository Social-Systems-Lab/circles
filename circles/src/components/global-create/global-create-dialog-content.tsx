"use client";

import React, { useState } from "react"; // Keep useState for potential future use if needed locally
import { DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { features } from "@/lib/data/constants"; // modules as moduleInfos removed as descriptions are simplified

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

const iconColors: Record<CreatableItemKey, string> = {
    community: "bg-purple-100 text-purple-600",
    project: "bg-blue-100 text-blue-600",
    post: "bg-orange-100 text-orange-600",
    task: "bg-teal-100 text-teal-600",
    event: "bg-pink-100 text-pink-600",
    issue: "bg-red-100 text-red-600",
    goal: "bg-cyan-100 text-cyan-600",
    proposal: "bg-yellow-100 text-yellow-600",
    discussion: "bg-indigo-100 text-indigo-600",
};

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
        title: "Community",
        description: "Start a new community or group.",
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
        title: "Announcement",
        description: "Share an announcement, update, or story.",
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
                {creatableItemsList.map((item) => (
                    <Card
                        key={item.key}
                        onClick={() => handleItemClick(item.key)}
                        className="group flex cursor-pointer flex-row items-center space-x-4 rounded-lg border p-4 shadow-sm transition-all hover:shadow-md"
                    >
                        <div
                            className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconColors[item.key]}`}
                        >
                            {item.icon && <item.icon className="h-6 w-6" />} {/* Conditionally render icon */}
                        </div>
                        <div className="flex-grow">
                            <CardTitle className="text-lg font-semibold">{item.title}</CardTitle>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default GlobalCreateDialogContent;

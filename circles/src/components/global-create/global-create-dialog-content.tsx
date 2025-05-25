"use client";

import React, { useState } from "react"; // Keep useState for potential future use if needed locally
import { DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Hammer, ListChecks, Target, MessageSquare, AlertTriangle, FileText, ChevronRight } from "lucide-react";
import { features } from "@/lib/data/constants"; // modules as moduleInfos removed as descriptions are simplified

// Define types for creatable items
export type CreatableItemKey = "community" | "project" | "task" | "goal" | "post" | "issue" | "proposal";

const iconColors: Record<CreatableItemKey, string> = {
    community: "bg-purple-100 text-purple-600",
    project: "bg-blue-100 text-blue-600",
    post: "bg-orange-100 text-orange-600",
    task: "bg-teal-100 text-teal-600",
    issue: "bg-red-100 text-red-600",
    goal: "bg-cyan-100 text-cyan-600",
    proposal: "bg-yellow-100 text-yellow-600",
};

export interface CreatableItemDetail {
    key: CreatableItemKey;
    title: string;
    description: string;
    icon: React.ElementType;
    // moduleHandle and createFeatureHandle might not be needed here anymore if this component only triggers dialogs
}

// Define the items that can be created
export const creatableItemsList: CreatableItemDetail[] = [
    // Added export
    {
        key: "community",
        title: "Community",
        description: "Start a new community or group.",
        icon: Users,
    },
    {
        key: "project",
        title: "Project",
        description: "Launch a new project.",
        icon: Hammer,
    },
    {
        key: "post",
        title: "Post",
        description: "Share an update, idea, or story.",
        icon: MessageSquare,
    },
    {
        key: "task",
        title: "Task",
        description: "Define a new task to be done.",
        icon: ListChecks,
    },
    {
        key: "goal",
        title: "Goal",
        description: "Set a new goal to achieve.",
        icon: Target,
    },
    {
        key: "issue",
        title: "Issue",
        description: "Report a new issue or problem.",
        icon: AlertTriangle,
    },
    {
        key: "proposal",
        title: "Proposal",
        description: "Make a new proposal for decision.",
        icon: FileText,
    },
];

interface GlobalCreateDialogContentProps {
    onCloseMainDialog: () => void; // To close this selection dialog
    setCreateTaskOpen: (open: boolean) => void;
    setCreateGoalOpen: (open: boolean) => void;
    setCreateIssueOpen: (open: boolean) => void;
    setCreateProposalOpen: (open: boolean) => void;
    setCreatePostOpen: (open: boolean) => void;
    setCreateCommunityOpen: (open: boolean) => void;
    setCreateProjectOpen: (open: boolean) => void;
}

export const GlobalCreateDialogContent: React.FC<GlobalCreateDialogContentProps> = ({
    onCloseMainDialog,
    setCreateTaskOpen,
    setCreateGoalOpen,
    setCreateIssueOpen,
    setCreateProposalOpen,
    setCreatePostOpen,
    setCreateCommunityOpen,
    setCreateProjectOpen,
}) => {
    const handleItemClick = (itemKey: CreatableItemKey) => {
        // It's better if the parent (GlobalCreateButton) closes this dialog
        // and then opens the specific one to avoid state complexities here.
        // So, onCloseMainDialog should ideally be called by the parent after one of these setters is called.
        // For now, let's assume the parent handles closing this dialog when one of the item dialogs opens.
        // Or, we call onCloseMainDialog() here. The user message said "main selection dialog might close".

        onCloseMainDialog(); // Close this (the selection) dialog.

        switch (itemKey) {
            case "task":
                setCreateTaskOpen(true);
                break;
            case "goal":
                setCreateGoalOpen(true);
                break;
            case "issue":
                setCreateIssueOpen(true);
                break;
            case "proposal":
                setCreateProposalOpen(true);
                break;
            case "post":
                setCreatePostOpen(true);
                break;
            case "community":
                setCreateCommunityOpen(true);
                break;
            case "project":
                setCreateProjectOpen(true);
                break;
            default:
                console.warn("Unknown item key:", itemKey);
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
                            <item.icon className="h-6 w-6" />
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

"use client";

import React, { useState } from "react";
import { DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Hammer, ListChecks, Target, MessageSquare, AlertTriangle, FileText, ChevronRight } from "lucide-react";
import { features, modules as moduleInfos } from "@/lib/data/constants";
import CircleSelector from "./circle-selector";
import { Circle } from "@/models/models";
import { CreateTaskDialog } from "./create-task-dialog";
import { CreateGoalDialog } from "./create-goal-dialog";
import { CreateIssueDialog } from "./create-issue-dialog";
import { CreateProposalDialog } from "./create-proposal-dialog";
import { CreatePostDialogContent } from "./create-post-dialog-content";
import CircleWizard from "@/components/circle-wizard/circle-wizard"; // Import CircleWizard
import { useToast } from "@/components/ui/use-toast";

// Define types for creatable items
export type CreatableItemKey = "community" | "project" | "task" | "goal" | "post" | "issue" | "proposal";

export interface CreatableItemDetail {
    key: CreatableItemKey;
    title: string;
    description: string;
    icon: React.ElementType;
    moduleHandle: string;
    createFeatureHandle: string;
    // Later: componentToRender: React.ElementType;
}

// Define the items that can be created
// Descriptions will be enhanced later, possibly from moduleInfos
const creatableItemsList: CreatableItemDetail[] = [
    {
        key: "community",
        title: "New Community",
        description: "Start a new community or group.",
        icon: Users,
        moduleHandle: "circles",
        createFeatureHandle: features.circles.create.handle,
    },
    {
        key: "project",
        title: "New Project",
        description: "Launch a new project.",
        icon: Hammer,
        moduleHandle: "projects",
        createFeatureHandle: features.projects.create.handle,
    },
    {
        key: "post",
        title: "New Post",
        description: "Share an update, idea, or story.",
        icon: MessageSquare,
        moduleHandle: "feed",
        createFeatureHandle: features.feed.post.handle,
    },
    {
        key: "task",
        title: "New Task",
        description: "Define a new task to be done.",
        icon: ListChecks,
        moduleHandle: "tasks",
        createFeatureHandle: features.tasks.create.handle,
    },
    {
        key: "goal",
        title: "New Goal",
        description: "Set a new goal to achieve.",
        icon: Target,
        moduleHandle: "goals",
        createFeatureHandle: features.goals.create.handle,
    },
    {
        key: "issue",
        title: "New Issue",
        description: "Report a new issue or problem.",
        icon: AlertTriangle,
        moduleHandle: "issues",
        createFeatureHandle: features.issues.create.handle,
    },
    {
        key: "proposal",
        title: "New Proposal",
        description: "Make a new proposal for decision.",
        icon: FileText,
        moduleHandle: "proposals",
        createFeatureHandle: features.proposals.create.handle,
    },
];

interface GlobalCreateDialogContentProps {
    // Props to manage state, e.g., onItemSelected, selectedCircle, etc. will be added later
}

export const GlobalCreateDialogContent: React.FC<GlobalCreateDialogContentProps> = () => {
    const [selectedItem, setSelectedItem] = useState<CreatableItemDetail | null>(null);
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const { toast } = useToast();

    const handleItemClick = (item: CreatableItemDetail) => {
        setSelectedItem(item);
        setSelectedCircle(null); // Reset selected circle when a new item is chosen
    };

    const handleCircleSelected = (circle: Circle | null) => {
        setSelectedCircle(circle);
    };

    const resetSelection = () => {
        setSelectedItem(null);
        setSelectedCircle(null);
    };

    const handleCreateSuccess = (createdItemId?: string) => {
        toast({
            title: `${selectedItem?.key || "Item"} created successfully!`,
            description: createdItemId ? `ID: ${createdItemId}` : undefined,
        });
        resetSelection(); // Go back to the item selection screen
        // Potentially close the main dialog as well, or offer a "Create another" option.
        // For now, resetSelection takes user back to the list of creatable items.
    };

    // Function to render the correct form based on selectedItem
    const renderCreationForm = () => {
        if (!selectedItem || !selectedCircle) {
            return <p className="text-sm text-muted-foreground">Please select a circle to proceed.</p>;
        }

        switch (selectedItem.key) {
            case "task":
                return (
                    <CreateTaskDialog
                        selectedCircle={selectedCircle}
                        selectedItem={selectedItem}
                        onSuccess={handleCreateSuccess}
                        onCancel={resetSelection} // Use resetSelection for the form's cancel
                    />
                );
            case "goal":
                return (
                    <CreateGoalDialog
                        selectedCircle={selectedCircle}
                        selectedItem={selectedItem}
                        onSuccess={handleCreateSuccess}
                        onCancel={resetSelection}
                    />
                );
            case "issue":
                return (
                    <CreateIssueDialog
                        selectedCircle={selectedCircle}
                        selectedItem={selectedItem}
                        onSuccess={handleCreateSuccess}
                        onCancel={resetSelection}
                    />
                );
            case "proposal":
                return (
                    <CreateProposalDialog
                        selectedCircle={selectedCircle}
                        selectedItem={selectedItem}
                        onSuccess={handleCreateSuccess}
                        onCancel={resetSelection}
                    />
                );
            case "post":
                return (
                    <CreatePostDialogContent
                        selectedCircle={selectedCircle}
                        selectedItem={selectedItem}
                        onSuccess={handleCreateSuccess}
                        onCancel={resetSelection}
                    />
                );
            case "community":
            case "project":
                // If selectedCircle is the user's own circle, parentId is undefined (top-level for user)
                // Otherwise, selectedCircle is the parent.
                const parentId = selectedCircle?.circleType === "user" ? undefined : selectedCircle?._id;
                return (
                    <CircleWizard
                        parentCircleId={parentId}
                        isProjectsPage={selectedItem.key === "project"}
                        onComplete={(createdCircleId?: string) => handleCreateSuccess(createdCircleId)}
                        // CircleWizard might need an onCancel prop if its internal cancel doesn't bubble up.
                        // For now, assuming its cancel/close is handled internally or by GlobalCreateDialog's back button.
                        // If CircleWizard has its own "Cancel" that doesn't call onComplete, we might need an onCancel prop here too.
                        // The `resetSelection` is effectively the cancel for this stage.
                    />
                );
            default:
                return (
                    <p>
                        {`Form for ${selectedItem.title} in circle '${selectedCircle.name || selectedCircle.handle}' will go here.`}
                    </p>
                );
        }
    };

    if (selectedItem) {
        // Display CircleSelector and then the form for the selectedItem
        return (
            <div className="formatted flex h-full flex-col">
                <DialogHeader className="border-b p-6 pb-4">
                    <DialogTitle>Create {selectedItem.title}</DialogTitle>
                    <DialogDescription>
                        {selectedCircle
                            ? `Creating in '${selectedCircle.name || selectedCircle.handle}'`
                            : `Select where to create this ${selectedItem.key}.`}
                    </DialogDescription>
                </DialogHeader>

                <CircleSelector itemType={selectedItem} onCircleSelected={handleCircleSelected} />

                <div className="flex-grow overflow-y-auto p-6 pt-2">
                    {" "}
                    {/* Adjusted padding */}
                    {renderCreationForm()}
                </div>

                {/* The "Back" button is now part of the individual forms via onCancel={resetSelection} 
                    or handled by the form's own cancel button.
                    If a specific form doesn't have a cancel button, this one can be reinstated.
                    For now, TaskForm will have its own cancel button tied to resetSelection.
                */}
                {/* <div className="flex justify-end border-t p-4">
                    <button onClick={resetSelection} className="rounded border px-4 py-2 hover:bg-gray-100">
                        Back
                    </button>
                </div> */}
            </div>
        );
    }

    // Initial view: Show list of creatable items
    return (
        <div className="formatted">
            <DialogHeader className="p-6 pb-4">
                <DialogTitle>Create New</DialogTitle>
                <DialogDescription>What would you like to create?</DialogDescription>
            </DialogHeader>
            <div className="formatted grid grid-cols-1 gap-4 p-6 pt-0 md:grid-cols-2">
                {creatableItemsList.map((item) => (
                    <Card
                        key={item.key}
                        onClick={() => handleItemClick(item)}
                        className="cursor-pointer transition-shadow hover:shadow-lg"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="formatted flex items-center space-x-3">
                                <item.icon className="h-6 w-6 text-muted-foreground" />
                                <div className="text-lg font-medium">{item.title}</div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default GlobalCreateDialogContent;

"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, GoalDisplay, UserPrivate } from "@/models/models";
import { TaskForm } from "@/components/modules/tasks/task-form";
import { CreatableItemDetail, CreatableItemKey } from "./global-create-dialog-content"; // Assuming CreatableItemKey is exported
import CircleSelector from "./circle-selector"; // To be embedded here
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
// Placeholder for actual item details if not passed fully
import { creatableItemsList } from "./global-create-dialog-content";

interface CreateTaskDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (taskId?: string) => void; // Callback on successful task creation
    itemKey: CreatableItemKey; // To know we are creating a task and for CircleSelector
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({ isOpen, onOpenChange, onSuccess, itemKey }) => {
    const [user] = useAtom(userAtom);
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);

    // Find the full item detail for context (e.g., title for dialog)
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        // Reset selected circle when dialog is closed externally
        if (!isOpen) {
            setSelectedCircle(null);
        }
    }, [isOpen]);

    const handleFormSuccess = (taskId?: string) => {
        onSuccess(taskId); // Call main success handler (e.g., for toast)
        onOpenChange(false); // Close this dialog
    };

    const handleCancel = () => {
        onOpenChange(false); // Close this dialog
    };

    if (itemKey !== "task" || !itemDetail) {
        // This check might be redundant if GlobalCreateButton ensures correct dialog is opened
        // but good for safety.
        if (isOpen) onOpenChange(false); // Close if wrong item
        return null;
    }

    // TODO: Fetch goals for the selectedCircle if goals module is enabled
    const goalsForCircle: GoalDisplay[] = [];
    const goalsModuleEnabled = selectedCircle?.enabledModules?.includes("goals") || false;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Create New {itemDetail.title}</DialogTitle>
                    {selectedCircle && (
                        <DialogDescription>
                            {`Creating in '${selectedCircle.name || selectedCircle.handle}'`}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {!user && <p className="p-4 text-red-500">Please log in to create a task.</p>}

                {user && (
                    <div className="pt-4">
                        <CircleSelector itemType={itemDetail} onCircleSelected={setSelectedCircle} />

                        {selectedCircle && (
                            <div className="mt-4">
                                <TaskForm
                                    circle={selectedCircle}
                                    circleHandle={selectedCircle.handle!}
                                    goals={goalsForCircle}
                                    goalsModuleEnabled={goalsModuleEnabled}
                                    onFormSubmitSuccess={handleFormSuccess}
                                    onCancel={handleCancel}
                                />
                            </div>
                        )}
                        {!selectedCircle && itemDetail && (
                            <p className="p-4 text-sm text-muted-foreground">
                                Please select a circle to create the {itemDetail.key}.
                            </p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateTaskDialog;

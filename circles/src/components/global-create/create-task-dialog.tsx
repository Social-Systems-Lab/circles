"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GoalDisplay, UserPrivate } from "@/models/models"; // Circle removed as it's handled in TaskForm
import { TaskForm } from "@/components/modules/tasks/task-form";
import { CreatableItemDetail, CreatableItemKey } from "./global-create-dialog-content";
// CircleSelector import removed, will be in TaskForm
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
// Placeholder for actual item details if not passed fully
import { creatableItemsList } from "./global-create-dialog-content";

interface CreateTaskDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void; // Updated to include circleHandle
    itemKey: CreatableItemKey; // To know we are creating a task and for CircleSelector
    initialSelectedCircleId?: string; // Added to pre-select a circle
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    itemKey,
    initialSelectedCircleId,
}) => {
    const [user] = useAtom(userAtom);

    // Find the full item detail for context (e.g., title for dialog)
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    // Effect to close dialog if itemKey is incorrect or itemDetail is missing
    useEffect(() => {
        if (isOpen && (itemKey !== "task" || !itemDetail)) {
            onOpenChange(false);
        }
    }, [isOpen, itemKey, itemDetail, onOpenChange]);

    const handleFormSuccess = (data: { id?: string; circleHandle?: string }) => {
        // Updated to receive object
        onSuccess(data); // Pass the whole object
        onOpenChange(false); // Close this dialog
    };

    const handleCancel = () => {
        onOpenChange(false); // Close this dialog
    };

    if (itemKey !== "task" || !itemDetail) {
        return null; // Render nothing if conditions aren't met, useEffect handles closing
    }

    // goalsForCircle and goalsModuleEnabled will be determined within TaskForm based on selected circle

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="z-[201] max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    // Allow closing by clicking outside if needed, or keep preventDefault
                    e.preventDefault();
                }}
            >
                {/* DialogHeader removed as TaskForm now provides its own card-based header */}
                <DialogTitle className="hidden">Create New Task</DialogTitle> {/* Hidden for accessibility */}
                {!user && <p className="p-4 text-red-500">Please log in to create a task.</p>}
                {user &&
                    itemDetail && ( // Ensure itemDetail is available
                        <TaskForm
                            user={user as UserPrivate} // Pass user to TaskForm
                            itemDetail={itemDetail} // Pass itemDetail for CircleSelector
                            initialSelectedCircleId={initialSelectedCircleId} // Pass down
                            // goals and goalsModuleEnabled will be handled by TaskForm
                            onFormSubmitSuccess={handleFormSuccess}
                            onCancel={handleCancel}
                            // Removed circle and circleHandle, TaskForm will manage this
                        />
                    )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateTaskDialog;

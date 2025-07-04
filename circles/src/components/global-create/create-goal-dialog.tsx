"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, ProposalDisplay, UserPrivate } from "@/models/models";
import { GoalForm } from "@/components/modules/goals/goal-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
// CircleSelector import removed, will be in GoalForm
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateGoalDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void; // Updated to include circleHandle
    itemKey: CreatableItemKey;
    proposal?: ProposalDisplay; // Optional proposal to prefill from
    initialSelectedCircleId?: string; // Changed from circle: Circle
}

export const CreateGoalDialog: React.FC<CreateGoalDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    itemKey,
    proposal,
    initialSelectedCircleId, // Changed from circle
}) => {
    const [user] = useAtom(userAtom);
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    // Effect to close dialog if itemKey is incorrect or itemDetail is missing
    useEffect(() => {
        if (isOpen && (itemKey !== "goal" || !itemDetail)) {
            onOpenChange(false);
        }
    }, [isOpen, itemKey, itemDetail, onOpenChange]);

    const handleFormSuccess = (data: { id?: string; circleHandle?: string }) => {
        // Updated to receive object
        onSuccess(data); // Pass the whole object
        onOpenChange(false);
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    if (itemKey !== "goal" || !itemDetail) {
        return null; // Render nothing if conditions aren't met, useEffect handles closing
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    // e.preventDefault();
                }}
            >
                {/* DialogHeader removed as GoalForm now provides its own card-based header */}
                {/* The title logic (proposal vs new) is handled within GoalForm's CardTitle */}
                <DialogTitle className="hidden">Create New Goal</DialogTitle> {/* Hidden for accessibility */}
                {!user && <p className="p-4 text-red-500">Please log in to create a goal.</p>}
                {user && itemDetail && (
                    <GoalForm
                        user={user as UserPrivate}
                        itemDetail={itemDetail}
                        onFormSubmitSuccess={handleFormSuccess}
                        onCancel={handleCancel}
                        proposal={proposal} // Pass optional proposal
                        initialSelectedCircleId={initialSelectedCircleId} // Pass down
                        // circle and circleHandle removed, GoalForm will manage this
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateGoalDialog;

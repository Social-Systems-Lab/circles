"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, UserPrivate } from "@/models/models";
import CircleWizard from "@/components/circle-wizard/circle-wizard";
import { CreatableItemKey, creatableItemsList, CreatableItemDetail } from "./global-create-dialog-content";
import CircleSelector from "./circle-selector"; // This will be used by CircleWizard internally or passed to it
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateCommunityProjectDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (circleId?: string) => void;
    itemKey: "community" | "project";
}

export const CreateCommunityProjectDialog: React.FC<CreateCommunityProjectDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    itemKey,
}) => {
    const [user] = useAtom(userAtom);
    // This state would ideally be inside CircleWizard or passed to it if CircleSelector is embedded there.
    // For now, this dialog doesn't directly use CircleSelector itself, CircleWizard will.
    // const [selectedParentCircle, setSelectedParentCircle] = useState<Circle | null>(null);

    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (!isOpen) {
            // setSelectedParentCircle(null); // Reset if state was here
        }
    }, [isOpen]);

    const handleWizardComplete = (createdCircleId?: string) => {
        onSuccess(createdCircleId);
        onOpenChange(false);
    };

    // The cancel for CircleWizard is typically handled by its internal "Close" or "X" button,
    // which should trigger onOpenChange(false) on the Dialog.
    // If CircleWizard needs an explicit onCancel prop, it can be added.

    if (!itemDetail || (itemKey !== "community" && itemKey !== "project")) {
        if (isOpen) onOpenChange(false);
        return null;
    }

    // Logic for parentCircleId:
    // This needs to be determined by a CircleSelector *inside* the CircleWizard's first step.
    // For now, we pass undefined, assuming top-level creation or user-owned.
    // When CircleWizard is refactored, it will manage this.
    const parentCircleIdForWizard = undefined; // Placeholder: This will be dynamic based on CircleWizard's internal selector

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-[95vw] p-0 sm:max-w-[95vw] md:max-w-[800px] lg:max-w-[1000px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <div className="hidden">
                    <DialogHeader>
                        <DialogTitle>
                            Create New {itemDetail?.title || (itemKey === "community" ? "Community" : "Project")}
                        </DialogTitle>
                        {/* Optional: Add DialogDescription if needed for accessibility, though often title is enough for hidden ones */}
                    </DialogHeader>
                </div>
                {/* 
                  The CircleSelector for choosing a PARENT will be *inside* CircleWizard.
                  The CircleWizard itself is the content.
                */}
                <CircleWizard
                    // parentCircleId={parentCircleIdForWizard} // Removed, CircleWizard handles this internally
                    isProjectsPage={itemKey === "project"}
                    onComplete={handleWizardComplete}
                    // TODO: CircleWizard might need an onCancel prop that calls onOpenChange(false)
                    // if its internal close buttons don't already trigger the Dialog's onOpenChange.
                />
            </DialogContent>
        </Dialog>
    );
};

export default CreateCommunityProjectDialog;

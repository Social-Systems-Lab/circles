"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserPrivate } from "@/models/models"; // Circle removed
import { ProposalForm } from "@/components/modules/proposals/proposal-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
// CircleSelector import removed
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateProposalDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void; // Updated to include circleHandle
    itemKey: CreatableItemKey;
    initialSelectedCircleId?: string; // Added to pre-select a circle
}

export const CreateProposalDialog: React.FC<CreateProposalDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    itemKey,
    initialSelectedCircleId, // Added
}) => {
    const [user] = useAtom(userAtom);
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (isOpen && (itemKey !== "proposal" || !itemDetail)) {
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

    if (itemKey !== "proposal" || !itemDetail) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="z-[201] max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                {/* DialogHeader removed as ProposalForm now provides its own card-based header */}
                <DialogTitle className="hidden">Create New Proposal</DialogTitle> {/* Hidden for accessibility */}
                {!user && <p className="p-4 text-red-500">Please log in to create a proposal.</p>}
                {user && itemDetail && (
                    <ProposalForm
                        user={user as UserPrivate}
                        itemDetail={itemDetail}
                        initialSelectedCircleId={initialSelectedCircleId} // Pass down
                        onFormSubmitSuccess={handleFormSuccess}
                        onCancel={handleCancel}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateProposalDialog;

"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserPrivate } from "@/models/models"; // Circle removed
import { IssueForm } from "@/components/modules/issues/issue-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
// CircleSelector import removed
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateIssueDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void; // Updated to include circleHandle
    itemKey: CreatableItemKey;
    initialSelectedCircleId?: string;
}

export const CreateIssueDialog: React.FC<CreateIssueDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    itemKey,
    initialSelectedCircleId,
}) => {
    const [user] = useAtom(userAtom);
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (isOpen && (itemKey !== "issue" || !itemDetail)) {
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

    if (itemKey !== "issue" || !itemDetail) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                {/* DialogHeader removed as IssueForm now provides its own card-based header */}
                <DialogTitle className="hidden">Create New Issue</DialogTitle> {/* Hidden for accessibility */}
                {!user && <p className="p-4 text-red-500">Please log in to create an issue.</p>}
                {user && itemDetail && (
                    <IssueForm
                        user={user as UserPrivate}
                        itemDetail={itemDetail}
                        onFormSubmitSuccess={handleFormSuccess}
                        onCancel={handleCancel}
                        initialSelectedCircleId={initialSelectedCircleId}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateIssueDialog;

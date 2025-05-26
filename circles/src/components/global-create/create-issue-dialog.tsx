"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, UserPrivate } from "@/models/models";
import { IssueForm } from "@/components/modules/issues/issue-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
import CircleSelector from "./circle-selector";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateIssueDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (issueId?: string) => void;
    itemKey: CreatableItemKey;
}

export const CreateIssueDialog: React.FC<CreateIssueDialogProps> = ({ isOpen, onOpenChange, onSuccess, itemKey }) => {
    const [user] = useAtom(userAtom);
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);

    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (!isOpen) {
            setSelectedCircle(null);
        }
    }, [isOpen]);

    const handleFormSuccess = (issueId?: string) => {
        onSuccess(issueId);
        onOpenChange(false);
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    if (itemKey !== "issue" || !itemDetail) {
        if (isOpen) onOpenChange(false);
        return null;
    }

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

                {!user && <p className="p-4 text-red-500">Please log in to create an issue.</p>}

                {user && (
                    <div className="pt-4">
                        <CircleSelector itemType={itemDetail} onCircleSelected={setSelectedCircle} />

                        {selectedCircle && (
                            <div className="mt-4">
                                <IssueForm
                                    circle={selectedCircle}
                                    circleHandle={selectedCircle.handle!}
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

export default CreateIssueDialog;

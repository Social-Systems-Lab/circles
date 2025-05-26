"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, UserPrivate } from "@/models/models"; // GoalDisplay is not needed here as GoalForm handles it
import { GoalForm } from "@/components/modules/goals/goal-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
import CircleSelector from "./circle-selector";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateGoalDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (goalId?: string) => void;
    itemKey: CreatableItemKey;
}

export const CreateGoalDialog: React.FC<CreateGoalDialogProps> = ({ isOpen, onOpenChange, onSuccess, itemKey }) => {
    const [user] = useAtom(userAtom);
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);

    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (!isOpen) {
            setSelectedCircle(null);
        }
    }, [isOpen]);

    const handleFormSuccess = (goalId?: string) => {
        onSuccess(goalId);
        onOpenChange(false);
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    if (itemKey !== "goal" || !itemDetail) {
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

                {!user && <p className="p-4 text-red-500">Please log in to create a goal.</p>}

                {user && (
                    <div className="pt-4">
                        <CircleSelector itemType={itemDetail} onCircleSelected={setSelectedCircle} />

                        {selectedCircle && (
                            <div className="mt-4">
                                <GoalForm
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

export default CreateGoalDialog;

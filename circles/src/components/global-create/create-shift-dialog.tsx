"use client";

import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserPrivate } from "@/models/models";
import { TaskForm } from "@/components/modules/tasks/task-form";
import { CreatableItemDetail, creatableItemsList } from "./global-create-dialog-content";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreateShiftDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void;
    initialSelectedCircleId?: string;
}

export const CreateShiftDialog: React.FC<CreateShiftDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    initialSelectedCircleId,
}) => {
    const [user] = useAtom(userAtom);
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === "task");

    useEffect(() => {
        if (isOpen && !itemDetail) {
            onOpenChange(false);
        }
    }, [isOpen, itemDetail, onOpenChange]);

    const handleFormSuccess = (data: { id?: string; circleHandle?: string }) => {
        onSuccess(data);
        onOpenChange(false);
    };

    if (!itemDetail) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(event) => {
                    event.preventDefault();
                }}
            >
                <DialogTitle className="hidden">Create Shift</DialogTitle>
                {!user && <p className="p-4 text-red-500">Please log in to create a shift.</p>}
                {user && (
                    <TaskForm
                        user={user as UserPrivate}
                        itemDetail={itemDetail}
                        initialSelectedCircleId={initialSelectedCircleId}
                        initialTaskType="shift"
                        forcedTaskType="shift"
                        hideTaskTypeSelector
                        labels={{
                            createTitle: "Create Shift",
                            editTitle: "Edit Shift",
                            createdToastTitle: "Shift Submitted",
                            updatedToastTitle: "Shift Updated",
                            createdToastDescription: "Shift successfully submitted.",
                            updatedToastDescription: "Shift successfully updated.",
                            submitCreate: "Create Shift",
                            submitEdit: "Update Shift",
                            titleDescription: "A short, clear name for the shift.",
                            titlePlaceholder: "e.g., Welcome desk morning shift",
                            descriptionLabel: "Shift Details",
                            descriptionPlaceholder: "Add details participants should know",
                            imagesDescription: "Upload images related to the shift (max 5 files, 5MB each).",
                            locationDescription: "Add the place where participants should arrive.",
                            noCircleSelected: "Please select a circle above to create the shift in.",
                        }}
                        onFormSubmitSuccess={handleFormSuccess}
                        onCancel={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateShiftDialog;

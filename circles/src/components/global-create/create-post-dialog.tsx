"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, Feed, UserPrivate } from "@/models/models";
import { PostForm } from "@/components/modules/feeds/post-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
// CircleSelector is now inside PostForm
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useToast } from "@/components/ui/use-toast";
import { createPostAction } from "@/components/modules/feeds/actions";

interface CreatePostDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (postId?: string) => void;
    itemKey: CreatableItemKey;
}

export const CreatePostDialog: React.FC<CreatePostDialogProps> = ({ isOpen, onOpenChange, onSuccess, itemKey }) => {
    const [user] = useAtom(userAtom);
    const { toast } = useToast();
    const [isSubmittingForm, setIsSubmittingForm] = useState(false);

    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    // Reset local state when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setIsSubmittingForm(false);
        }
    }, [isOpen]);

    // Effect to handle closing the dialog if itemKey is incorrect or itemDetail is missing
    useEffect(() => {
        if (isOpen && (itemKey !== "post" || !itemDetail)) {
            onOpenChange(false);
        }
    }, [isOpen, itemKey, itemDetail, onOpenChange]);

    const handleFormSuccess = (postId?: string) => {
        onSuccess(postId);
        onOpenChange(false); // Close this dialog
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    // Conditional rendering based on itemKey and itemDetail, but side effect moved to useEffect
    if (itemKey !== "post" || !itemDetail) {
        return null; // Render nothing if conditions aren't met, useEffect handles closing
    }

    // PostForm's onSubmit now expects (formData, targetCircleId)
    const internalPostFormSubmit = async (formData: FormData, targetCircleId: string) => {
        setIsSubmittingForm(true);

        // The createPostAction expects circleId on formData to determine the feed.
        // PostForm now provides targetCircleId separately.
        // We need to ensure createPostAction can derive the feed from targetCircleId.
        // For now, let's add circleId to formData as createPostAction expects.
        // This might need adjustment in createPostAction later if it's to use targetCircleId directly.
        formData.append("circleId", targetCircleId);

        // feedId is derived by createPostAction from circleId (default feed)
        // So, no need to explicitly add feedId here if createPostAction handles it.

        const response = await createPostAction(formData);

        if (!response.success) {
            toast({
                title: response.message || "Failed to create announcement.",
                variant: "destructive",
            });
            setIsSubmittingForm(false);
            return;
        } else {
            handleFormSuccess(response.post?._id);
        }
        setIsSubmittingForm(false);
    };

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
                    {/* Description can be simplified or removed as CircleSelector is inside PostForm */}
                </DialogHeader>

                {!user && <p className="p-4 text-red-500">Please log in to create an announcement.</p>}

                {user && (
                    <PostForm
                        user={user as UserPrivate}
                        onSubmit={internalPostFormSubmit}
                        onCancel={handleCancel}
                        isSubmitting={isSubmittingForm}
                        moduleHandle={itemDetail.moduleHandle}
                        createFeatureHandle={itemDetail.createFeatureHandle}
                        itemKey={itemKey}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreatePostDialog;

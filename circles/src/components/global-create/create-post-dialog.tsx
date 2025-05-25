"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, Feed, UserPrivate } from "@/models/models";
import { PostForm } from "@/components/modules/feeds/post-form";
import { CreatableItemDetail, CreatableItemKey, creatableItemsList } from "./global-create-dialog-content";
import CircleSelector from "./circle-selector";
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
    const { toast } = useToast(); // Keep toast for potential direct use if needed, though parent handles main success
    const [isSubmittingForm, setIsSubmittingForm] = useState(false); // Renamed to avoid conflict with PostForm's internal state if any

    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const [targetFeed, setTargetFeed] = useState<Feed | null>(null);
    const [feedError, setFeedError] = useState<string | null>(null);

    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (!isOpen) {
            setSelectedCircle(null); // Reset selected circle when dialog is closed
            setTargetFeed(null);
            setFeedError(null);
        }
    }, [isOpen]);

    useEffect(() => {
        // Fetch/determine targetFeed when selectedCircle changes
        if (selectedCircle && user) {
            // TODO: Implement actual robust feed fetching/selection logic.
            // This is a placeholder.
            const dummyFeed: Feed = {
                _id: "dummyFeedIdFor_" + selectedCircle._id,
                name: selectedCircle.handle === user.handle ? "My Feed" : "Primary Feed",
                handle: "primary",
                circleId: selectedCircle._id!,
                createdAt: new Date(),
                userGroups: [],
            };
            setTargetFeed(dummyFeed);
            setFeedError(null);
        } else {
            setTargetFeed(null);
        }
    }, [selectedCircle, user]);

    const handleFormSuccess = (postId?: string) => {
        onSuccess(postId);
        onOpenChange(false);
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    if (itemKey !== "post" || !itemDetail) {
        if (isOpen) onOpenChange(false);
        return null;
    }

    // This is the internal submit handler for PostForm, which then calls the dialog's success handler
    const internalPostFormSubmit = async (formData: FormData) => {
        if (!selectedCircle || !targetFeed) {
            toast({ title: "Error", description: "Circle or Feed not selected.", variant: "destructive" });
            return;
        }
        setIsSubmittingForm(true);
        // Ensure circleId and feedId are on the formData if PostForm doesn't add them
        // PostForm's handleSubmit in its original context (CreateNewPost) adds circleId.
        // It might need feedId too. Let's assume PostForm is adapted or createPostAction handles it.
        // For safety, we can add them if not present, or rely on PostForm to do so.
        // formData.append("circleId", selectedCircle._id!); // PostForm should handle this via its circle prop
        formData.append("feedId", targetFeed._id!); // PostForm needs feedId

        const response = await createPostAction(formData);

        if (!response.success) {
            toast({
                title: response.message || "Failed to create post.",
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
            <DialogContent className="sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]">
                <DialogHeader>
                    <DialogTitle>Create New {itemDetail.title}</DialogTitle>
                    {selectedCircle && (
                        <DialogDescription>
                            {`Creating in '${selectedCircle.name || selectedCircle.handle}'`}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {!user && <p className="p-4 text-red-500">Please log in to create a post.</p>}

                {user && (
                    <div className="pt-4">
                        <CircleSelector itemType={itemDetail} onCircleSelected={setSelectedCircle} />

                        {selectedCircle && !targetFeed && !feedError && (
                            <p className="p-4 text-sm text-muted-foreground">Loading feed...</p>
                        )}
                        {feedError && <p className="p-4 text-sm text-red-500">{feedError}</p>}

                        {selectedCircle && targetFeed && (
                            <div className="mt-4">
                                {" "}
                                {/* Ensure PostForm is only rendered when ready */}
                                <PostForm
                                    circle={selectedCircle}
                                    feed={targetFeed}
                                    user={user as UserPrivate}
                                    onSubmit={internalPostFormSubmit}
                                    onCancel={handleCancel}
                                    isSubmitting={isSubmittingForm}
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

export default CreatePostDialog;

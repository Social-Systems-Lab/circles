"use client";

import React, { useTransition } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAtom } from "jotai";
import { createPostDialogAtom, userAtom } from "@/lib/data/atoms";
import { PostForm } from "@/components/modules/feeds/post-form";
import { UserPrivate } from "@/models/models";
import { createPostAction } from "@/components/modules/feeds/actions";
import { useToast } from "@/components/ui/use-toast";

export function FeedPostDialog() {
    const [dialogState, setDialogState] = useAtom(createPostDialogAtom);
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleClose = () => {
        setDialogState({ isOpen: false });
    };

    const handleSubmit = async (formData: FormData, targetCircleId?: string) => {
        // Added targetCircleId parameter
        const finalCircleId = targetCircleId || dialogState.circle?._id; // Use targetCircleId if available

        if (!finalCircleId) {
            toast({ title: "Error", description: "Circle ID is missing.", variant: "destructive" });
            return;
        }
        // Ensure circleId is on the formData for createPostAction.
        // PostForm's onSubmit provides the most up-to-date circleId.
        formData.append("circleId", finalCircleId);

        startTransition(async () => {
            const response = await createPostAction(formData);

            if (!response.success) {
                toast({
                    title: response.message || "Failed to create post",
                    variant: "destructive",
                });
                return;
            } else {
                toast({
                    title: "Post created successfully",
                    variant: "success",
                });
            }
            handleClose();
        });
    };

    if (!dialogState.isOpen || !user || !dialogState.circle || !dialogState.feed) {
        return null;
    }

    return (
        <Dialog open={dialogState.isOpen} onOpenChange={handleClose}>
            <DialogContent
                className="z-[110] flex h-[90vh] w-[95vw] max-w-3xl flex-col rounded-[15px] bg-white p-0"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <div className="hidden">
                    <DialogTitle>Create a new post</DialogTitle>
                </div>
                <PostForm
                    user={user as UserPrivate}
                    onSubmit={handleSubmit}
                    onCancel={handleClose}
                    itemKey="post" // This is for the PostForm's internal logic for CircleSelector
                    moduleHandle="feed"
                    createFeatureHandle="post"
                    initialSelectedCircleId={dialogState.circle._id} // Pre-select the circle from the atom
                    isSubmitting={isPending}
                />
            </DialogContent>
        </Dialog>
    );
}

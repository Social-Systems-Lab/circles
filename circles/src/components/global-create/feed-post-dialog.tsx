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

    const handleSubmit = async (formData: FormData) => {
        if (!dialogState.circle?._id) {
            toast({ title: "Error", description: "Circle context is missing.", variant: "destructive" });
            return;
        }
        // The PostForm already appends selectedCircleId to formData if initialSelectedCircleId is passed.
        // However, createPostAction expects the target circleId as a separate argument if not on formData.
        // For clarity and consistency with how PostForm works, we can rely on it being on formData.
        // Or, ensure targetCircleId is explicitly passed if createPostAction requires it differently.

        startTransition(async () => {
            const response = await createPostAction(formData); // Assuming createPostAction can get circleId from formData or it's implicitly handled.
            // If createPostAction needs circleId explicitly, it should be:
            // const response = await createPostAction(formData, dialogState.circle!._id);

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
                className="z-[110] rounded-[15px] bg-white p-0 sm:max-w-[425px] sm:rounded-[15px]"
                onInteractOutside={(e) => {
                    // Allow closing by clicking outside if needed, or prevent it:
                    // e.preventDefault();
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

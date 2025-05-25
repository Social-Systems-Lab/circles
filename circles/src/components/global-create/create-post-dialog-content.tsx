"use client";

import React, { useEffect, useState } from "react";
import { Circle, Feed, UserPrivate } from "@/models/models";
import { PostForm } from "@/components/modules/feeds/post-form";
import { CreatableItemDetail } from "./global-create-dialog-content";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useToast } from "@/components/ui/use-toast";
import { createPostAction } from "@/components/modules/feeds/actions"; // For the direct submit handler

interface CreatePostDialogContentProps {
    selectedCircle: Circle;
    selectedItem: CreatableItemDetail; // To confirm it's a post
    onSuccess: (postId?: string) => void; // Callback on successful post creation
    onCancel: () => void; // Callback to go back or cancel
}

export const CreatePostDialogContent: React.FC<CreatePostDialogContentProps> = ({
    selectedCircle,
    selectedItem,
    onSuccess,
    onCancel,
}) => {
    const [user] = useAtom(userAtom);
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // TODO: Implement robust feed fetching/selection logic.
    // For now, using a placeholder. This is a critical part to make it fully functional.
    // Option 1: Fetch all feeds for selectedCircle and pick the first one.
    // Option 2: Assume a convention for a "primary" feed handle.
    // Option 3: If selectedCircle is the user's own circle, it might have a specific personal feed.
    const [targetFeed, setTargetFeed] = useState<Feed | null>(null);
    const [feedError, setFeedError] = useState<string | null>(null);

    useEffect(() => {
        // Placeholder: Simulate fetching the primary feed for the circle
        // In a real app, this would be an API call, e.g., getPrimaryFeedForCircle(selectedCircle._id)
        if (selectedCircle) {
            // For demonstration, creating a dummy feed object.
            // Replace with actual feed fetching logic.
            const dummyFeed: Feed = {
                _id: "dummyFeedIdFor_" + selectedCircle._id,
                name: "Primary Feed",
                handle: "primary",
                circleId: selectedCircle._id!,
                createdAt: new Date(),
                userGroups: [], // Assuming default user groups or fetch appropriately
            };
            if (selectedCircle.handle === user?.handle) {
                // If it's user's own circle
                dummyFeed.name = "My Feed";
            }
            setTargetFeed(dummyFeed);
            setFeedError(null);
        } else {
            setTargetFeed(null);
            setFeedError("No circle selected to find a feed.");
        }
    }, [selectedCircle, user?.handle]);

    if (selectedItem.key !== "post") {
        return <p className="text-red-500">Error: Incorrect item type for Post creation.</p>;
    }

    if (!user) {
        return <p className="text-red-500">User not available. Please log in.</p>;
    }

    if (feedError) {
        return <p className="text-red-500">Could not determine target feed: {feedError}</p>;
    }

    if (!targetFeed) {
        return <p className="text-muted-foreground">Loading feed information...</p>;
    }

    // This handleSubmit is passed to PostForm.
    // PostForm's internal onSubmit will call this.
    const handlePostFormSubmit = async (formData: FormData) => {
        setIsSubmitting(true);
        // formData from PostForm already includes circleId and feedId if PostForm is set up correctly.
        // We might need to ensure PostForm adds these if they are not part of its standard fields.
        // For now, assuming createPostAction can derive them or they are added by PostForm.
        // Alternatively, append them here if PostForm doesn't.
        // formData.append("circleId", selectedCircle._id!); // Example if needed
        // formData.append("feedId", targetFeed._id!); // Example if needed

        const response = await createPostAction(formData); // createPostAction might need circleId/feedId if not on formData

        if (!response.success) {
            toast({
                title: response.message || "Failed to create post.",
                variant: "destructive",
            });
            setIsSubmitting(false);
            return;
        } else {
            // Toast is handled by GlobalCreateDialogContent's onSuccess
            onSuccess(response.post?._id); // Call the main success handler, using post._id
        }
        setIsSubmitting(false);
    };

    return (
        <div className="p-0">
            {" "}
            {/* PostForm might have its own padding/styling */}
            <PostForm
                circle={selectedCircle}
                feed={targetFeed} // Pass the determined/fetched feed
                user={user as UserPrivate}
                onSubmit={handlePostFormSubmit} // This is PostForm's prop
                onCancel={onCancel} // Pass down the cancel handler
                isSubmitting={isSubmitting} // Pass down submitting state
            />
        </div>
    );
};

export default CreatePostDialogContent;

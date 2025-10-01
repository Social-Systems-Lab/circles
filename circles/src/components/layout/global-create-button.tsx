"use client";

import React, { useState, useCallback, useEffect } from "react"; // Added useEffect
import { useRouter } from "next/navigation"; // Import useRouter
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GlobalCreateDialogContent, CreatableItemKey } from "@/components/global-create/global-create-dialog-content";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai"; // Added useAtom
import { userAtom, createPostDialogAtom } from "@/lib/data/atoms"; // Added createPostDialogAtom and userAtom
import { Circle, Feed, UserPrivate } from "@/models/models"; // Added Circle, Feed, UserPrivate
import { getPublicUserFeedAction } from "@/components/modules/feeds/actions"; // Changed to server action

// Import specific dialog components (assuming they are refactored to be full dialogs)
// TODO: These imports will need to point to the actual refactored dialog components
import { CreateTaskDialog } from "@/components/global-create/create-task-dialog";
import { CreateGoalDialog } from "@/components/global-create/create-goal-dialog";
import { CreateIssueDialog } from "@/components/global-create/create-issue-dialog";
import { CreateProposalDialog } from "@/components/global-create/create-proposal-dialog";
import { CreateEventDialog } from "@/components/global-create/create-event-dialog";
// CreatePostDialog import will be removed as FeedPostDialog handles this globally
// import { CreatePostDialog } from "@/components/global-create/create-post-dialog";
import { CreateCommunityDialog } from "@/components/global-create/create-community-dialog"; // Updated Import
import { CreateProjectDialog } from "@/components/global-create/create-project-dialog";

export function GlobalCreateButton() {
    const router = useRouter(); // Initialize router
    const [isMainDialogOpen, setIsMainDialogOpen] = useState(false);
    const [user] = useAtom(userAtom); // Get user from atom
    const [, setCreatePostDialogState] = useAtom(createPostDialogAtom); // Atom for FeedPostDialog
    const [userFeed, setUserFeed] = useState<Feed | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const fetchUserFeed = async () => {
            if (user?.did) {
                try {
                    const feed = await getPublicUserFeedAction(user.did); // Use server action
                    setUserFeed(feed);
                } catch (error) {
                    console.error("Failed to fetch user feed:", error);
                    setUserFeed(null); // Ensure it's null on error
                }
            } else {
                setUserFeed(null); // Clear feed if no user
            }
        };

        fetchUserFeed();
    }, [user]); // Re-run when user changes

    // State to manage which specific creation dialog to open
    const [selectedItemTypeForCreation, setSelectedItemTypeForCreation] = useState<CreatableItemKey | null>(null);

    // States for Community and Project dialogs (handled differently for now)
    const [isCreateCommunityOpen, setCreateCommunityOpen] = useState(false);
    const [isCreateProjectOpen, setCreateProjectOpen] = useState(false);

    const handleItemCreatedSuccess = (
        itemKey: CreatableItemKey,
        payload?: string | { id?: string; circleHandle?: string },
    ) => {
        toast({
            title: `${itemKey.charAt(0).toUpperCase() + itemKey.slice(1)} created successfully!`,
        });
        setSelectedItemTypeForCreation(null);
        setCreateCommunityOpen(false);

        const id = typeof payload === "string" ? payload : payload?.id;
        const circleHandle = typeof payload === "string" ? payload : payload?.circleHandle;

        if (id) {
            // Map itemKey to path segment
            const pathSegmentMap: Record<CreatableItemKey, string | null> = {
                post: "post", // Or the correct path for posts if different
                task: "tasks",
                goal: "goals",
                issue: "issues",
                proposal: "proposals",
                event: "events",
                community: "circles", // Or specific community view if exists
                project: null,
                discussion: "discussions",
            };
            const pathSegment = pathSegmentMap[itemKey];
            // For community and project, the ID is the handle itself; navigate directly to the circle
            if (itemKey === "community" || itemKey === "project") {
                router.push(`/circles/${circleHandle ?? id}`);
            } else if (pathSegment && circleHandle) {
                router.push(`/circles/${circleHandle}/${pathSegment}/${id}`);
            }
        }
    };

    const handleSelectItemType = async (itemKey: CreatableItemKey) => {
        if (itemKey === "post") {
            if (user && userFeed) {
                setCreatePostDialogState({
                    isOpen: true,
                    circle: user as Circle, // Use user's own circle context
                    feed: userFeed, // Use user's own feed context
                });
                setSelectedItemTypeForCreation(null); // Don't trigger the old CreatePostDialog
            } else {
                // Handle case where user or userFeed is not available
                toast({
                    title: "Cannot create announcement",
                    description: "User or feed information is missing.",
                    variant: "destructive",
                });
            }
        } else {
            setSelectedItemTypeForCreation(itemKey);
        }
        // Main dialog is already closed by GlobalCreateDialogContent's handleItemClick
    };

    // Helper to manage open state for individual dialogs based on selectedItemTypeForCreation
    const isSpecificDialogOpen = (itemKey: CreatableItemKey) => selectedItemTypeForCreation === itemKey;

    const setSpecificDialogClose = useCallback(() => {
        setSelectedItemTypeForCreation(null);
    }, [setSelectedItemTypeForCreation]); // setSelectedItemTypeForCreation is stable

    // Memoized onOpenChange handlers for individual dialogs
    const createDialogOnOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                setSpecificDialogClose();
            }
        },
        [setSpecificDialogClose],
    );

    const communityDialogOnOpenChange = useCallback(
        (open: boolean) => {
            setCreateCommunityOpen(open);
            if (!open) {
                // If closing community dialog specifically, ensure main selection is also cleared
                // This might be redundant if success/cancel also calls setSpecificDialogClose or similar
                // but good for explicit closure.
                setSelectedItemTypeForCreation(null);
            }
        },
        [setCreateCommunityOpen, setSelectedItemTypeForCreation],
    );

    return (
        <>
            <Dialog open={isMainDialogOpen} onOpenChange={setIsMainDialogOpen}>
                <DialogTrigger asChild>
                    <motion.div
                        className="flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg text-[#696969] md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8]"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 * 0.1 }} // Adjusted delay
                    >
                        <Plus size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px] text-[#696969]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 0.4 * 0.1 }}
                        >
                            Create
                        </motion.span>
                    </motion.div>
                </DialogTrigger>
                <DialogContent
                    className="z-[1000] max-h-[90vh] overflow-y-auto rounded-[15px] bg-white p-0 sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <GlobalCreateDialogContent
                        onCloseMainDialog={() => setIsMainDialogOpen(false)}
                        onSelectItemType={handleSelectItemType}
                        setCreateCommunityOpen={setCreateCommunityOpen}
                        setCreateProjectOpen={setCreateProjectOpen}
                    />
                </DialogContent>
            </Dialog>

            {/* Render specific creation dialogs based on selectedItemTypeForCreation */}
            <CreateTaskDialog
                isOpen={isSpecificDialogOpen("task")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(data) => handleItemCreatedSuccess("task", data)}
                itemKey="task"
            />
            <CreateGoalDialog
                isOpen={isSpecificDialogOpen("goal")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(data) => handleItemCreatedSuccess("goal", data)} // Pass the data object
                itemKey="goal"
            />
            <CreateIssueDialog
                isOpen={isSpecificDialogOpen("issue")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(data) => handleItemCreatedSuccess("issue", data)}
                itemKey="issue"
            />
            <CreateProposalDialog
                isOpen={isSpecificDialogOpen("proposal")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(data) => handleItemCreatedSuccess("proposal", data)}
                itemKey="proposal"
            />
            <CreateEventDialog
                isOpen={isSpecificDialogOpen("event")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(data) => handleItemCreatedSuccess("event", data)}
                itemKey="event"
            />
            {/* CreatePostDialog instance removed, FeedPostDialog will be used via atom */}

            {/* Community and Project dialogs remain as they were for now */}
            <CreateCommunityDialog
                isOpen={isCreateCommunityOpen}
                onOpenChange={communityDialogOnOpenChange}
                onSuccess={(data) => handleItemCreatedSuccess("community", data)}
                // itemKey="community" // No longer needed by CreateCommunityDialog
            />
            <CreateProjectDialog
                isOpen={isCreateProjectOpen}
                onOpenChange={setCreateProjectOpen}
                onSuccess={(data) => handleItemCreatedSuccess("project", data)}
            />
        </>
    );
}

export default GlobalCreateButton;

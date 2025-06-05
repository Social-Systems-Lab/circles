"use client";

import React, { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GlobalCreateDialogContent, CreatableItemKey } from "@/components/global-create/global-create-dialog-content";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";

// Import specific dialog components (assuming they are refactored to be full dialogs)
// TODO: These imports will need to point to the actual refactored dialog components
import { CreateTaskDialog } from "@/components/global-create/create-task-dialog";
import { CreateGoalDialog } from "@/components/global-create/create-goal-dialog";
import { CreateIssueDialog } from "@/components/global-create/create-issue-dialog";
import { CreateProposalDialog } from "@/components/global-create/create-proposal-dialog";
import { CreatePostDialog } from "@/components/global-create/create-post-dialog";
import { CreateCommunityDialog } from "@/components/global-create/create-community-dialog"; // Updated Import

export function GlobalCreateButton() {
    const [isMainDialogOpen, setIsMainDialogOpen] = useState(false);
    const { toast } = useToast();

    // State to manage which specific creation dialog to open
    const [selectedItemTypeForCreation, setSelectedItemTypeForCreation] = useState<CreatableItemKey | null>(null);

    // States for Community and Project dialogs (handled differently for now)
    const [isCreateCommunityOpen, setCreateCommunityOpen] = useState(false);
    // const [isCreateProjectOpen, setCreateProjectOpen] = useState(false); // Removed project state

    const handleItemCreatedSuccess = (itemKey: CreatableItemKey, createdItemId?: string) => {
        toast({
            title: `${itemKey.charAt(0).toUpperCase() + itemKey.slice(1)} created successfully!`,
        });
        // Close the specific dialog by resetting the selected item type
        setSelectedItemTypeForCreation(null);
        // Also ensure community/project dialogs are closed if they were open
        setCreateCommunityOpen(false);
        // setCreateProjectOpen(false); // Removed project state setter
    };

    const handleSelectItemType = (itemKey: CreatableItemKey) => {
        setSelectedItemTypeForCreation(itemKey);
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
                    className="z-[100] max-h-[90vh] overflow-y-auto rounded-[15px] bg-white p-0 sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <GlobalCreateDialogContent
                        onCloseMainDialog={() => setIsMainDialogOpen(false)}
                        onSelectItemType={handleSelectItemType}
                        setCreateCommunityOpen={setCreateCommunityOpen} // Keep for now
                        // setCreateProjectOpen={setCreateProjectOpen} // Removed
                    />
                </DialogContent>
            </Dialog>

            {/* Render specific creation dialogs based on selectedItemTypeForCreation */}
            <CreateTaskDialog
                isOpen={isSpecificDialogOpen("task")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(id) => handleItemCreatedSuccess("task", id)}
                itemKey="task"
            />
            <CreateGoalDialog
                isOpen={isSpecificDialogOpen("goal")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(id) => handleItemCreatedSuccess("goal", id)}
                itemKey="goal"
            />
            <CreateIssueDialog
                isOpen={isSpecificDialogOpen("issue")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(id) => handleItemCreatedSuccess("issue", id)}
                itemKey="issue"
            />
            <CreateProposalDialog
                isOpen={isSpecificDialogOpen("proposal")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(id) => handleItemCreatedSuccess("proposal", id)}
                itemKey="proposal"
            />
            <CreatePostDialog
                isOpen={isSpecificDialogOpen("post")}
                onOpenChange={createDialogOnOpenChange}
                onSuccess={(id) => handleItemCreatedSuccess("post", id)}
                itemKey="post"
            />

            {/* Community and Project dialogs remain as they were for now */}
            <CreateCommunityDialog
                isOpen={isCreateCommunityOpen}
                onOpenChange={communityDialogOnOpenChange}
                onSuccess={(id) => handleItemCreatedSuccess("community", id)}
                // itemKey="community" // No longer needed by CreateCommunityDialog
            />
            {/* Removed Project Dialog instance */}
        </>
    );
}

export default GlobalCreateButton;

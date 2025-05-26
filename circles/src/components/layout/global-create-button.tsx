"use client";

import React, { useState } from "react";
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
import { CreateCommunityProjectDialog } from "@/components/global-create/create-community-project-dialog"; // Import

export function GlobalCreateButton() {
    const [isMainDialogOpen, setIsMainDialogOpen] = useState(false);
    const { toast } = useToast();

    // States for each specific creation dialog
    const [isCreateTaskOpen, setCreateTaskOpen] = useState(false);
    const [isCreateGoalOpen, setCreateGoalOpen] = useState(false);
    const [isCreateIssueOpen, setCreateIssueOpen] = useState(false);
    const [isCreateProposalOpen, setCreateProposalOpen] = useState(false);
    const [isCreatePostOpen, setCreatePostOpen] = useState(false); // Placeholder
    const [isCreateCommunityOpen, setCreateCommunityOpen] = useState(false); // Placeholder
    const [isCreateProjectOpen, setCreateProjectOpen] = useState(false); // Placeholder

    const handleItemCreatedSuccess = (itemKey: CreatableItemKey, createdItemId?: string) => {
        toast({
            title: `${itemKey.charAt(0).toUpperCase() + itemKey.slice(1)} created successfully!`,
            // description: createdItemId ? `ID: ${createdItemId}` : undefined, // Removed ID from toast
        });
        // Ensure all specific dialogs are closed (though they should close themselves via onOpenChange)
        setCreateTaskOpen(false);
        setCreateGoalOpen(false);
        setCreateIssueOpen(false);
        setCreateProposalOpen(false);
        setCreatePostOpen(false);
        setCreateCommunityOpen(false);
        setCreateProjectOpen(false);
    };

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
                        setCreateTaskOpen={setCreateTaskOpen}
                        setCreateGoalOpen={setCreateGoalOpen}
                        setCreateIssueOpen={setCreateIssueOpen}
                        setCreateProposalOpen={setCreateProposalOpen}
                        setCreatePostOpen={setCreatePostOpen}
                        setCreateCommunityOpen={setCreateCommunityOpen}
                        setCreateProjectOpen={setCreateProjectOpen}
                    />
                </DialogContent>
            </Dialog>

            {/* Render all individual creation dialogs here, controlled by their respective states */}
            {/* These dialogs will need to be refactored to be proper Dialog components */}
            {/* and to include the CircleSelector internally */}

            <CreateTaskDialog
                isOpen={isCreateTaskOpen}
                onOpenChange={setCreateTaskOpen}
                onSuccess={(id) => handleItemCreatedSuccess("task", id)}
                itemKey="task" // Pass itemKey
            />
            <CreateGoalDialog
                isOpen={isCreateGoalOpen}
                onOpenChange={setCreateGoalOpen}
                onSuccess={(id) => handleItemCreatedSuccess("goal", id)}
                itemKey="goal" // Pass itemKey
            />
            <CreateIssueDialog
                isOpen={isCreateIssueOpen}
                onOpenChange={setCreateIssueOpen}
                onSuccess={(id) => handleItemCreatedSuccess("issue", id)}
                itemKey="issue" // Pass itemKey
            />
            <CreateProposalDialog
                isOpen={isCreateProposalOpen}
                onOpenChange={setCreateProposalOpen}
                onSuccess={(id) => handleItemCreatedSuccess("proposal", id)}
                itemKey="proposal" // Pass itemKey
            />
            <CreatePostDialog
                isOpen={isCreatePostOpen}
                onOpenChange={setCreatePostOpen}
                onSuccess={(id) => handleItemCreatedSuccess("post", id)}
                itemKey="post"
            />

            <CreateCommunityProjectDialog
                isOpen={isCreateCommunityOpen}
                onOpenChange={setCreateCommunityOpen}
                onSuccess={(id) => handleItemCreatedSuccess("community", id)}
                itemKey="community"
            />
            <CreateCommunityProjectDialog
                isOpen={isCreateProjectOpen}
                onOpenChange={setCreateProjectOpen}
                onSuccess={(id) => handleItemCreatedSuccess("project", id)}
                itemKey="project"
            />
        </>
    );
}

export default GlobalCreateButton;

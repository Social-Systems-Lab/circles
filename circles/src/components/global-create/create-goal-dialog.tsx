"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Circle, ProposalDisplay, UserPrivate } from "@/models/models"; // Added ProposalDisplay
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
    proposal?: ProposalDisplay; // Optional proposal to prefill from
    // circle prop might be needed if we bypass CircleSelector when proposal is present
    circle?: Circle; // If passed, this circle is used directly
}

export const CreateGoalDialog: React.FC<CreateGoalDialogProps> = ({
    isOpen,
    onOpenChange,
    onSuccess,
    itemKey,
    proposal,
    circle: preselectedCircle, // Renamed for clarity
}) => {
    const [user] = useAtom(userAtom);
    // Initialize selectedCircle with preselectedCircle if available, especially when a proposal is passed
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(preselectedCircle || null);

    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === itemKey);

    useEffect(() => {
        if (proposal && proposal.circle) {
            // If a proposal is passed, use its circle and disable/hide circle selector
            setSelectedCircle(proposal.circle as Circle); // Assuming proposal.circle is populated
        } else if (preselectedCircle) {
            setSelectedCircle(preselectedCircle);
        }
        if (!isOpen) {
            // Reset selectedCircle only if not pre-filled by proposal or direct prop
            if (!proposal && !preselectedCircle) {
                setSelectedCircle(null);
            }
        }
    }, [isOpen, proposal, preselectedCircle]);

    const initialGoalData = useMemo(() => {
        if (proposal) {
            return {
                title: proposal.name,
                description: `${proposal.background}\n\nDecision: ${proposal.decisionText}`, // Combine background and decision text
                proposalId: proposal._id?.toString(), // Pass proposalId to GoalForm
            };
        }
        return undefined;
    }, [proposal]);

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

    // Determine if CircleSelector should be shown
    // Show if no proposal is passed AND no preselectedCircle is passed
    const showCircleSelector = !proposal && !preselectedCircle;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <DialogHeader className="hidden">
                    <DialogTitle>
                        {proposal ? `Create Goal from Proposal: ${proposal.name}` : `Create New ${itemDetail.title}`}
                    </DialogTitle>
                    {selectedCircle && (
                        <DialogDescription>
                            {`Creating in '${selectedCircle.name || selectedCircle.handle}'`}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {selectedCircle && (
                    <div className="mt-4">
                        <GoalForm
                            circle={selectedCircle}
                            circleHandle={selectedCircle.handle!}
                            onFormSubmitSuccess={handleFormSuccess}
                            onCancel={handleCancel}
                            initialData={initialGoalData} // Pass initial data to GoalForm
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateGoalDialog;

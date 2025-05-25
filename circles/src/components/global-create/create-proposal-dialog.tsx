"use client";

import React from "react";
import { Circle } from "@/models/models";
import { ProposalForm } from "@/components/modules/proposals/proposal-form";
import { CreatableItemDetail } from "./global-create-dialog-content";

interface CreateProposalDialogProps {
    selectedCircle: Circle;
    selectedItem: CreatableItemDetail; // To confirm it's a proposal
    onSuccess: (proposalId?: string) => void; // Callback on successful proposal creation
    onCancel: () => void; // Callback to go back or cancel
}

export const CreateProposalDialog: React.FC<CreateProposalDialogProps> = ({
    selectedCircle,
    selectedItem,
    onSuccess,
    onCancel,
}) => {
    if (selectedItem.key !== "proposal") {
        return <p className="text-red-500">Error: Incorrect item type for Proposal creation.</p>;
    }

    return (
        <div className="p-0">
            {" "}
            {/* ProposalForm has its own Card styling with padding */}
            <ProposalForm
                circle={selectedCircle}
                circleHandle={selectedCircle.handle!}
                // proposal prop would be undefined for new proposal
                onFormSubmitSuccess={onSuccess}
                onCancel={onCancel}
            />
        </div>
    );
};

export default CreateProposalDialog;

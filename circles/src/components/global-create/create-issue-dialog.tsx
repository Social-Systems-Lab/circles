"use client";

import React from "react";
import { Circle } from "@/models/models";
import { IssueForm } from "@/components/modules/issues/issue-form";
import { CreatableItemDetail } from "./global-create-dialog-content";

interface CreateIssueDialogProps {
    selectedCircle: Circle;
    selectedItem: CreatableItemDetail; // To confirm it's an issue
    onSuccess: (issueId?: string) => void; // Callback on successful issue creation
    onCancel: () => void; // Callback to go back or cancel
}

export const CreateIssueDialog: React.FC<CreateIssueDialogProps> = ({
    selectedCircle,
    selectedItem,
    onSuccess,
    onCancel,
}) => {
    if (selectedItem.key !== "issue") {
        return <p className="text-red-500">Error: Incorrect item type for Issue creation.</p>;
    }

    return (
        <div className="p-0">
            {" "}
            {/* IssueForm has its own Card styling with padding */}
            <IssueForm
                circle={selectedCircle}
                circleHandle={selectedCircle.handle!}
                // issue prop would be undefined for new issue
                onFormSubmitSuccess={onSuccess}
                onCancel={onCancel}
            />
        </div>
    );
};

export default CreateIssueDialog;

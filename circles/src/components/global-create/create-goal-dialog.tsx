"use client";

import React from "react";
import { Circle } from "@/models/models";
import { GoalForm } from "@/components/modules/goals/goal-form";
import { CreatableItemDetail } from "./global-create-dialog-content";

interface CreateGoalDialogProps {
    selectedCircle: Circle;
    selectedItem: CreatableItemDetail; // To confirm it's a goal
    onSuccess: (goalId?: string) => void; // Callback on successful goal creation
    onCancel: () => void; // Callback to go back or cancel
}

export const CreateGoalDialog: React.FC<CreateGoalDialogProps> = ({
    selectedCircle,
    selectedItem,
    onSuccess,
    onCancel,
}) => {
    if (selectedItem.key !== "goal") {
        return <p className="text-red-500">Error: Incorrect item type for Goal creation.</p>;
    }

    // GoalForm does not currently require extra fetched props like TaskForm (for goals list)
    // It fetches its own necessary data if any, or takes simple props.

    return (
        <div className="p-0">
            {" "}
            {/* GoalForm has its own Card styling with padding */}
            <GoalForm
                circle={selectedCircle}
                circleHandle={selectedCircle.handle!}
                // goal prop would be undefined for new goal
                onFormSubmitSuccess={onSuccess}
                onCancel={onCancel}
            />
        </div>
    );
};

export default CreateGoalDialog;

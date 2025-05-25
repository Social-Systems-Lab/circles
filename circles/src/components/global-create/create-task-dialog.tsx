"use client";

import React from "react";
import { Circle, GoalDisplay } from "@/models/models"; // Added GoalDisplay
import { TaskForm } from "@/components/modules/tasks/task-form"; // Assuming TaskForm can be imported
import { CreatableItemDetail } from "./global-create-dialog-content";
// We'll need to fetch goals for the TaskForm if the goals module is enabled in the selectedCircle
// For now, this is a simplified version.
// import { getGoalsForCircle } from "@/lib/data/goal"; // Example, actual function may vary

interface CreateTaskDialogProps {
    selectedCircle: Circle;
    selectedItem: CreatableItemDetail; // To confirm it's a task
    onSuccess: (taskId?: string) => void; // Callback on successful task creation
    onCancel: () => void; // Callback to go back or cancel
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
    selectedCircle,
    selectedItem,
    onSuccess,
    onCancel,
}) => {
    if (selectedItem.key !== "task") {
        // Should not happen if parent component logic is correct
        return <p className="text-red-500">Error: Incorrect item type for Task creation.</p>;
    }

    // TODO: Fetch goals for the selectedCircle if goals module is enabled
    // This is a simplified placeholder for goals data and goalsModuleEnabled flag
    const goalsForCircle: GoalDisplay[] = []; // Explicitly typed
    const goalsModuleEnabled = selectedCircle.enabledModules?.includes("goals") || false;

    return (
        <div className="p-0">
            {" "}
            {/* TaskForm has its own Card styling with padding */}
            <TaskForm
                circle={selectedCircle}
                circleHandle={selectedCircle.handle!} // TaskForm expects circleHandle
                // task prop would be undefined for new task
                goals={goalsForCircle} // Pass fetched/empty goals
                goalsModuleEnabled={goalsModuleEnabled} // Pass flag
                onFormSubmitSuccess={onSuccess} // Pass the onSuccess callback
                onCancel={onCancel} // Pass the onCancel callback
            />
        </div>
    );
};

export default CreateTaskDialog;

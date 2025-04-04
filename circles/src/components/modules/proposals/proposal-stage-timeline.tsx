"use client";

import React from "react";
import { ProposalStage, ProposalOutcome } from "@/models/models";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react"; // Import XCircle

interface ProposalStageTimelineProps {
    currentStage: ProposalStage;
    outcome?: ProposalOutcome;
    resolvedAtStage?: ProposalStage; // New prop
}

export const ProposalStageTimeline: React.FC<ProposalStageTimelineProps> = ({
    currentStage,
    outcome,
    resolvedAtStage, // Use the new prop
}) => {
    // Define all stages in order
    const stages: ProposalStage[] = ["draft", "review", "voting", "resolved"];

    // Determine rejection stage directly from resolvedAtStage if outcome is rejected
    const rejectionStage: ProposalStage | null = outcome === "rejected" ? resolvedAtStage || null : null;

    // Find the index of the current stage
    const currentStageIndex = stages.indexOf(currentStage);
    const rejectionStageIndex = rejectionStage ? stages.indexOf(rejectionStage) : -1;

    // Helper function to determine the status of each stage
    const getStageStatus = (stage: ProposalStage) => {
        const stageIndex = stages.indexOf(stage);

        // If the proposal is rejected, the rejection stage itself is 'completed' visually (green check)
        // but the 'Resolved' stage shows the rejection.
        if (outcome === "rejected") {
            if (stage === "resolved") return "rejected"; // Final stage shows rejection
            if (stageIndex <= rejectionStageIndex) return "completed"; // Stages up to rejection are completed
            return "skipped"; // Stages after rejection are skipped
        }

        // If accepted or still in progress
        if (stageIndex < currentStageIndex) return "completed";
        if (stageIndex === currentStageIndex) return "current";
        return "upcoming";
    };

    // Helper function to get the appropriate icon for each stage
    const getStageIcon = (stage: ProposalStage, status: string) => {
        if (status === "rejected") {
            // Only the 'Resolved' stage will have this status now
            return <XCircle className="h-6 w-6 text-red-500" />;
        }
        if (status === "completed") {
            return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        }
        if (status === "skipped") {
            return <Circle className="h-6 w-6 text-gray-300" />; // Use upcoming icon for skipped
        }
        if (status === "current") {
            // If current stage is 'resolved' and it was accepted, show completed icon
            if (stage === "resolved" && outcome === "accepted") {
                return <CheckCircle2 className="h-6 w-6 text-green-500" />;
            }
            // Otherwise, show the current stage icon (clock)
            return <Clock className="h-6 w-6 text-blue-500" />;
        }
        // Upcoming stage
        return <Circle className="h-6 w-6 text-gray-300" />;
    };

    // Helper function to get the label for each stage
    const getStageLabel = (stage: ProposalStage) => {
        switch (stage) {
            case "draft":
                return "Draft";
            case "review":
                return "Review";
            case "voting":
                return "Voting";
            case "resolved":
                return "Resolved";
            default:
                // This case should never happen as we've covered all possible values
                // But TypeScript requires a default case
                return "Unknown Stage";
        }
    };

    return (
        <div className="w-full">
            <div className="mb-[30px] flex items-center justify-between">
                {stages.map((stage, index) => {
                    const status = getStageStatus(stage);
                    const isFirst = index === 0;
                    const isLast = index === stages.length - 1;

                    return (
                        <React.Fragment key={stage}>
                            {/* Stage indicator */}
                            <div className="relative flex flex-col items-center">
                                <div
                                    className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full",
                                        status === "rejected" && "bg-red-100",
                                        status === "completed" && "bg-green-100",
                                        status === "current" && "bg-blue-100",
                                        (status === "upcoming" || status === "skipped") && "bg-gray-100", // Skipped uses upcoming style
                                        // Special case for resolved stage when accepted
                                        stage === "resolved" && outcome === "accepted" && "bg-green-100",
                                    )}
                                >
                                    {getStageIcon(stage, status)}
                                </div>
                                <span
                                    className={cn(
                                        "absolute bottom-[-25px] text-sm font-medium",
                                        status === "rejected" && "text-red-600",
                                        status === "completed" && "text-green-600",
                                        status === "current" && "text-blue-600",
                                        (status === "upcoming" || status === "skipped") && "text-gray-500", // Skipped uses upcoming style
                                        // Special case for resolved stage when accepted
                                        stage === "resolved" && outcome === "accepted" && "text-green-600",
                                    )}
                                >
                                    {getStageLabel(stage)}
                                </span>
                            </div>

                            {/* Connector line (except after the last stage) */}
                            {!isLast && (
                                <div
                                    className={cn(
                                        "h-0.5 flex-1",
                                        // Line logic based on the *next* stage's status
                                        getStageStatus(stages[index + 1]) === "completed" ||
                                            (getStageStatus(stages[index + 1]) === "current" &&
                                                outcome !== "rejected") ||
                                            getStageStatus(stages[index + 1]) === "rejected"
                                            ? "bg-green-500" // Green if next is completed, current (and not rejected), or the final rejected stage
                                            : "bg-gray-200", // Gray otherwise (upcoming or skipped)
                                        // If the proposal was rejected, lines after the rejection stage are gray
                                        rejectionStage && index >= rejectionStageIndex && "bg-gray-200",
                                        // If the proposal was accepted, all lines are green
                                        currentStage === "resolved" && outcome === "accepted" && "bg-green-500",
                                    )}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

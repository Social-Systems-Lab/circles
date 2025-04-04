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

    // Helper function to determine the status of each stage
    const getStageStatus = (stage: ProposalStage) => {
        const stageIndex = stages.indexOf(stage);

        if (stage === rejectionStage) return "rejected"; // Use rejectionStage directly
        if (stageIndex < currentStageIndex) return "completed";
        if (stageIndex === currentStageIndex) return "current";
        return "upcoming";
    };

    // Helper function to get the appropriate icon for each stage
    const getStageIcon = (stage: ProposalStage, status: string) => {
        if (status === "rejected") {
            return <XCircle className="h-6 w-6 text-red-500" />;
        }
        if (status === "completed") {
            return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        }
        if (status === "current") {
            // If current stage is 'resolved' and it was rejected, show rejected icon
            if (stage === "resolved" && outcome === "rejected") {
                return <XCircle className="h-6 w-6 text-red-500" />;
            }
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
                                        status === "rejected" && "bg-red-100", // Red background for rejected
                                        status === "completed" && "bg-green-100",
                                        status === "current" && "bg-blue-100",
                                        status === "upcoming" && "bg-gray-100",
                                        // Special case for resolved stage based on outcome
                                        stage === "resolved" && outcome === "accepted" && "bg-green-100",
                                        stage === "resolved" && outcome === "rejected" && "bg-red-100",
                                    )}
                                >
                                    {getStageIcon(stage, status)}
                                </div>
                                <span
                                    className={cn(
                                        "absolute bottom-[-25px] text-sm font-medium",
                                        status === "rejected" && "text-red-600", // Red text for rejected
                                        status === "completed" && "text-green-600",
                                        status === "current" && "text-blue-600",
                                        status === "upcoming" && "text-gray-500",
                                        // Special case for resolved stage based on outcome
                                        stage === "resolved" && outcome === "accepted" && "text-green-600",
                                        stage === "resolved" && outcome === "rejected" && "text-red-600",
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
                                        // Line is green if the *next* stage is completed or current (and not rejected)
                                        // Or if the current stage itself is completed (and not rejected)
                                        index < currentStageIndex && stages[index + 1] !== rejectionStage
                                            ? "bg-green-500"
                                            : "bg-gray-200",
                                        // If the current stage is the rejection stage, the line before it should be gray
                                        stages[index + 1] === rejectionStage && "bg-gray-200",
                                        // If the proposal is resolved rejected, all lines after rejection point are gray
                                        rejectionStage && index >= stages.indexOf(rejectionStage) && "bg-gray-200",
                                        // If the proposal is resolved accepted, all lines are green
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

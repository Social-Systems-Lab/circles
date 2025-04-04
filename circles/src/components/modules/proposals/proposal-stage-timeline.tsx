"use client";

import React from "react";
import { ProposalStage } from "@/models/models";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, HelpCircle } from "lucide-react";

interface ProposalStageTimelineProps {
    currentStage: ProposalStage;
}

export const ProposalStageTimeline: React.FC<ProposalStageTimelineProps> = ({ currentStage }) => {
    // Define all stages in order
    const stages: ProposalStage[] = ["draft", "review", "voting", "resolved"];

    // Find the index of the current stage
    const currentStageIndex = stages.indexOf(currentStage);

    // Helper function to determine the status of each stage
    const getStageStatus = (stage: ProposalStage) => {
        const stageIndex = stages.indexOf(stage);

        if (stageIndex < currentStageIndex) {
            return "completed";
        } else if (stageIndex === currentStageIndex) {
            return "current";
        } else {
            return "upcoming";
        }
    };

    // Helper function to get the appropriate icon for each stage
    const getStageIcon = (stage: ProposalStage, status: string) => {
        if (status === "completed") {
            return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        } else if (status === "current") {
            return <Clock className="h-6 w-6 text-blue-500" />;
        } else {
            return <Circle className="h-6 w-6 text-gray-300" />;
        }
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
                                        status === "completed" && "bg-green-100",
                                        status === "current" && "bg-blue-100",
                                        status === "upcoming" && "bg-gray-100",
                                    )}
                                >
                                    {getStageIcon(stage, status)}
                                </div>
                                <span
                                    className={cn(
                                        "absolute bottom-[-25px] text-sm font-medium",
                                        status === "completed" && "text-green-600",
                                        status === "current" && "text-blue-600",
                                        status === "upcoming" && "text-gray-500",
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
                                        index < currentStageIndex ? "bg-green-500" : "bg-gray-200",
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

"use client";

import React from "react";
import { ProposalStage, ProposalOutcome } from "@/models/models";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";

interface ProposalStageTimelineProps {
    currentStage: ProposalStage; // This is the actual current stage of the proposal, e.g., 'rejected', 'implemented', 'voting'
    outcome?: ProposalOutcome; // Relevant for 'rejected' or if 'accepted' was an outcome
    resolvedAtStage?: ProposalStage; // The stage *from which* it was resolved (rejected or implemented)
}

export const ProposalStageTimeline: React.FC<ProposalStageTimelineProps> = ({
    currentStage,
    outcome, // outcome from proposal object, could be 'rejected' or 'accepted' (if it reached that outcome)
    resolvedAtStage, // The stage the proposal was in when it was moved to a terminal state
}) => {
    // Define all potential stages in their linear progression
    const timelineDisplayStages: ProposalStage[] = ["draft", "review", "voting", "accepted", "implemented"];

    const actualCurrentStage = currentStage; // e.g., 'rejected', 'implemented', 'voting'
    const isRejected = actualCurrentStage === "rejected";
    const isImplemented = actualCurrentStage === "implemented";

    const getStageStatus = (stageToCheck: ProposalStage, indexInTimeline: number): string => {
        if (isRejected) {
            const rejectionPointIndex = resolvedAtStage ? timelineDisplayStages.indexOf(resolvedAtStage) : -1;
            if (rejectionPointIndex === -1) {
                // If resolvedAtStage is not on our timeline (e.g. rejected from draft)
                // Mark all as skipped, except if 'draft' is the rejection point.
                return stageToCheck === "draft" && resolvedAtStage === "draft" ? "rejected-at" : "skipped";
            }
            if (indexInTimeline < rejectionPointIndex) return "completed";
            if (indexInTimeline === rejectionPointIndex) return "rejected-at"; // The stage where rejection occurred
            return "skipped"; // Stages after the rejection point
        }

        if (isImplemented) {
            // If implemented, all stages up to and including 'implemented' are 'completed'
            const implementedIndex = timelineDisplayStages.indexOf("implemented");
            if (indexInTimeline <= implementedIndex) return "completed";
            return "upcoming"; // Should not happen if implemented is last
        }

        // Standard progression for active proposals
        const currentStageIndexInTimeline = timelineDisplayStages.indexOf(actualCurrentStage);
        if (indexInTimeline < currentStageIndexInTimeline) return "completed";
        if (indexInTimeline === currentStageIndexInTimeline) return "current";
        return "upcoming";
    };

    const getStageIcon = (status: string) => {
        if (status === "rejected-at") return <XCircle className="h-6 w-6 text-red-500" />;
        if (status === "completed") return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        if (status === "current") return <Clock className="h-6 w-6 text-blue-500" />;
        // upcoming or skipped
        return <Circle className="h-6 w-6 text-gray-300" />;
    };

    const getStageLabel = (stage: ProposalStage) => {
        switch (stage) {
            case "draft":
                return "Draft";
            case "review":
                return "Review";
            case "voting":
                return "Voting";
            case "accepted":
                return "Accepted";
            case "implemented":
                return "Implemented";
            default:
                return "Unknown"; // Should not happen
        }
    };

    return (
        <div className="w-full">
            <div className="mb-[30px] flex items-center justify-between">
                {timelineDisplayStages.map((stage, index) => {
                    const status = getStageStatus(stage, index);
                    const isLastStageInTimeline = index === timelineDisplayStages.length - 1;

                    return (
                        <React.Fragment key={stage}>
                            <div className="relative flex flex-col items-center">
                                <div
                                    className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full",
                                        status === "completed" && "bg-green-100",
                                        status === "current" && "bg-blue-100",
                                        (status === "upcoming" || status === "skipped") && "bg-gray-100",
                                        status === "rejected-at" && "bg-red-100",
                                    )}
                                >
                                    {getStageIcon(status)}
                                </div>
                                <span
                                    className={cn(
                                        "absolute bottom-[-25px] whitespace-nowrap text-sm font-medium",
                                        status === "completed" && "text-green-600",
                                        status === "current" && "text-blue-600",
                                        (status === "upcoming" || status === "skipped") && "text-gray-500",
                                        status === "rejected-at" && "text-red-600",
                                    )}
                                >
                                    {getStageLabel(stage)}
                                </span>
                            </div>

                            {!isLastStageInTimeline && (
                                <div
                                    className={cn(
                                        "h-0.5 flex-1",
                                        // Line is green if the current node is completed or current,
                                        // AND the proposal is not rejected OR if it is rejected but this stage is before or at the rejection point.
                                        (status === "completed" || status === "current") &&
                                            (!isRejected ||
                                                (resolvedAtStage &&
                                                    index < timelineDisplayStages.indexOf(resolvedAtStage)))
                                            ? "bg-green-500"
                                            : "bg-gray-200",
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

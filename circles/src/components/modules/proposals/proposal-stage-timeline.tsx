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
    resolvedAtStage,
}) => {
    const stages: ProposalStage[] = ["draft", "review", "voting", "accepted", "implemented"];
    // 'rejected' is a terminal state that can occur from 'review', 'voting', or 'accepted'.
    // It's not a linear step after 'implemented'.

    const currentActualStage = currentStage; // The actual stage from the proposal object
    const isRejected = currentActualStage === "rejected";
    const isImplemented = currentActualStage === "implemented";

    // Determine the visual "current" point on the timeline
    // If rejected, the timeline stops at the stage it was rejected *from* (resolvedAtStage)
    // If implemented, it goes all the way to 'implemented'.
    // Otherwise, it's the currentStage.
    let visualCurrentStage = currentActualStage;
    if (isRejected && resolvedAtStage) {
        visualCurrentStage = resolvedAtStage;
    }

    const visualCurrentStageIndex = stages.indexOf(visualCurrentStage);

    const getStageStatus = (stage: ProposalStage, index: number) => {
        if (isRejected) {
            if (resolvedAtStage && index < stages.indexOf(resolvedAtStage)) return "completed";
            if (resolvedAtStage && stage === resolvedAtStage) return "rejected-at"; // Special status for the point of rejection
            if (resolvedAtStage && index > stages.indexOf(resolvedAtStage)) return "skipped";
            // If rejected from a stage not in the main timeline (e.g. draft, if not listed)
            // or if resolvedAtStage is somehow not on the timeline, mark all as skipped or based on currentActualStage
            if (stage === currentActualStage) return "rejected-at"; // If current stage is 'rejected' itself
            return "skipped"; // Default for rejected if specific point unclear
        }

        if (isImplemented) {
            // If implemented, all defined stages are considered completed.
            // The "implemented" stage itself will get the 'implemented' status.
            if (stage === "implemented") return "implemented";
            return "completed";
        }

        // Standard flow
        if (index < visualCurrentStageIndex) return "completed";
        if (index === visualCurrentStageIndex) return "current";
        return "upcoming";
    };

    const getStageIcon = (stage: ProposalStage, status: string) => {
        if (status === "rejected-at") return <XCircle className="h-6 w-6 text-red-500" />;
        if (status === "implemented") return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        if (status === "completed") return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        if (status === "current") return <Clock className="h-6 w-6 text-blue-500" />;
        return <Circle className="h-6 w-6 text-gray-300" />; // upcoming or skipped
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
            // 'rejected' is not a label on the linear timeline here
            default:
                return "Unknown";
        }
    };

    // Final display node for Rejected/Implemented status if applicable
    const finalStatusNode = () => {
        if (isRejected) {
            return (
                <div className="relative flex flex-col items-center">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-red-100")}>
                        <XCircle className="h-6 w-6 text-red-500" />
                    </div>
                    <span className={cn("absolute bottom-[-25px] text-sm font-medium text-red-600")}>
                        Rejected
                        {resolvedAtStage && ` (at ${getStageLabel(resolvedAtStage)})`}
                    </span>
                </div>
            );
        }
        // 'Implemented' is part of the main stages array now.
        return null;
    };

    const timelineStages = isRejected ? stages.filter((s) => s !== "implemented") : stages;

    return (
        <div className="w-full">
            <div className="mb-[30px] flex items-center justify-between">
                {timelineStages.map((stage, index) => {
                    // If proposal is rejected, and this stage is 'implemented', skip it.
                    if (isRejected && stage === "implemented") return null;

                    const status = getStageStatus(stage, index);
                    const isLastVisible = isRejected
                        ? resolvedAtStage
                            ? stage === resolvedAtStage
                            : index === timelineStages.length - 1
                        : index === timelineStages.length - 1;

                    return (
                        <React.Fragment key={stage}>
                            <div className="relative flex flex-col items-center">
                                <div
                                    className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full",
                                        (status === "completed" || status === "implemented") && "bg-green-100",
                                        status === "current" && "bg-blue-100",
                                        (status === "upcoming" || status === "skipped") && "bg-gray-100",
                                        status === "rejected-at" && "bg-red-100",
                                    )}
                                >
                                    {getStageIcon(stage, status)}
                                </div>
                                <span
                                    className={cn(
                                        "absolute bottom-[-25px] whitespace-nowrap text-sm font-medium",
                                        (status === "completed" || status === "implemented") && "text-green-600",
                                        status === "current" && "text-blue-600",
                                        (status === "upcoming" || status === "skipped") && "text-gray-500",
                                        status === "rejected-at" && "text-red-600",
                                    )}
                                >
                                    {getStageLabel(stage)}
                                </span>
                            </div>

                            {!isLastVisible && (
                                <div
                                    className={cn(
                                        "h-0.5 flex-1",
                                        (status === "completed" ||
                                            status === "current" ||
                                            status === "implemented" ||
                                            status === "rejected-at") &&
                                            !(isRejected && resolvedAtStage && index >= stages.indexOf(resolvedAtStage))
                                            ? "bg-green-500"
                                            : "bg-gray-200",
                                    )}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
                {isRejected && resolvedAtStage && stages.indexOf(resolvedAtStage) < stages.indexOf("implemented") && (
                    <div className={cn("h-0.5 flex-1 bg-gray-200")} /> /* Connector to final rejected node if needed */
                )}
                {isRejected && finalStatusNode()}
            </div>
        </div>
    );
};

"use client";

import React, { useState, useTransition } from "react";
import { Circle, ContentPreviewData, ProposalDisplay, ProposalStage } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalStageTimeline } from "./proposal-stage-timeline";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { Heart, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { UserPicture } from "../members/user-picture";
import { cn } from "@/lib/utils";
import { useAtom } from "jotai";
import { contentPreviewAtom, sidePanelContentVisibleAtom, userAtom } from "@/lib/data/atoms";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import RichText from "../feeds/RichText";
import { CirclePicture } from "../circles/circle-picture";
import { useIsCompact } from "@/components/utils/use-is-compact";

interface ProposalItemProps {
    proposal: ProposalDisplay;
    circle: Circle;
}

const getStageBadgeColor = (stage: ProposalStage) => {
    switch (stage) {
        case "draft":
            return "bg-gray-200 text-gray-800";
        case "review":
            return "bg-blue-200 text-blue-800";
        case "voting":
            return "bg-green-200 text-green-800";
        case "resolved":
            return "bg-purple-200 text-purple-800";
        default:
            return "bg-gray-200 text-gray-800";
    }
};

export const ProposalItem: React.FC<ProposalItemProps> = ({ proposal, circle }) => {
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isVoting, setIsVoting] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isCompact = useIsCompact();
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);

    // Check permissions
    const isAuthor = user?.did === proposal.createdBy;
    const canEdit = isAuthor || isAuthorized(user, circle, features.proposals.moderate);
    const canReview = isAuthorized(user, circle, features.proposals.review);
    const canVote = isAuthorized(user, circle, features.proposals.vote);
    const canResolve = isAuthorized(user, circle, features.proposals.resolve);

    // Check if user has already voted
    const hasVoted = !!proposal.userReaction;

    // Calculate vote count
    const voteCount = Object.values(proposal.reactions || {}).reduce((sum, count) => sum + count, 0);

    const handleEdit = () => {
        router.push(`/circles/${circle.handle}/proposals/${proposal._id}/edit`);
    };

    const handleDelete = async () => {
        startTransition(async () => {
            // TODO: Implement delete proposal action
            // const result = await deleteProposalAction(proposal._id);

            // Temporary mock implementation
            const success = true;
            const message = "Proposal deleted successfully";

            if (success) {
                toast({
                    title: "Success",
                    description: message,
                });
                router.push(`/circles/${circle.handle}/proposals`);
            } else {
                toast({
                    title: "Error",
                    description: message || "Failed to delete proposal",
                    variant: "destructive",
                });
            }

            setDeleteDialogOpen(false);
        });
    };

    const handleVote = async () => {
        if (proposal.stage !== "voting") return;

        setIsVoting(true);
        try {
            // TODO: Implement vote action
            // const result = await voteOnProposalAction(proposal._id, hasVoted ? null : "like");

            // Temporary mock implementation
            const success = true;

            if (success) {
                toast({
                    title: hasVoted ? "Vote removed" : "Vote added",
                    description: hasVoted ? "Your vote has been removed" : "Your vote has been added",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: "Failed to process your vote",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred",
                variant: "destructive",
            });
        } finally {
            setIsVoting(false);
        }
    };

    const handleStageChange = async (newStage: ProposalStage, outcomeReason?: string) => {
        startTransition(async () => {
            // TODO: Implement stage change action
            // const result = await changeProposalStageAction(proposal._id, newStage, outcomeReason);

            // Temporary mock implementation
            const success = true;
            const message = `Proposal moved to ${newStage} stage`;

            if (success) {
                toast({
                    title: "Success",
                    description: message,
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: "Failed to update proposal stage",
                    variant: "destructive",
                });
            }
        });
    };

    const openCircle = () => {
        if (isCompact) {
            router.push(`/circles/${proposal.author.handle}`);
            return;
        }
        let contentPreviewData: ContentPreviewData = {
            type: "user",
            content: proposal.author,
        };
        setContentPreview((x) =>
            x?.content === proposal.author && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    // Render stage-specific action buttons
    const renderStageActions = () => {
        switch (proposal.stage) {
            case "draft":
                if (isAuthor) {
                    return (
                        <div className="flex space-x-2">
                            <Button onClick={handleEdit}>Edit Proposal</Button>
                            <Button onClick={() => handleStageChange("review")} disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>Submit for Review</>
                                )}
                            </Button>
                        </div>
                    );
                }
                return null;

            case "review":
                if (canReview) {
                    return (
                        <div className="flex space-x-2">
                            <Button variant="outline" onClick={() => handleStageChange("draft")} disabled={isPending}>
                                Return to Draft
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => handleStageChange("resolved", "Rejected in review")}
                                disabled={isPending}
                            >
                                Reject
                            </Button>
                            <Button onClick={() => handleStageChange("voting")} disabled={isPending}>
                                Approve for Voting
                            </Button>
                        </div>
                    );
                }
                return null;

            case "voting":
                return (
                    <div className="flex space-x-2">
                        {canVote && (
                            <Button
                                variant={hasVoted ? "default" : "outline"}
                                onClick={handleVote}
                                disabled={isVoting}
                                className={cn(
                                    "flex items-center",
                                    hasVoted && "bg-pink-100 text-pink-800 hover:bg-pink-200 hover:text-pink-900",
                                )}
                            >
                                <Heart className={cn("mr-1 h-4 w-4", hasVoted && "fill-current")} />
                                {isVoting ? "Processing..." : hasVoted ? "Voted" : "Vote"} ({voteCount})
                            </Button>
                        )}
                        {canResolve && (
                            <>
                                <Button
                                    variant="destructive"
                                    onClick={() => handleStageChange("resolved", "Rejected after voting")}
                                    disabled={isPending}
                                >
                                    Reject
                                </Button>
                                <Button
                                    onClick={() => handleStageChange("resolved", "Accepted after voting")}
                                    disabled={isPending}
                                >
                                    Accept
                                </Button>
                            </>
                        )}
                    </div>
                );

            case "resolved":
                return null;

            default:
                return null;
        }
    };

    return (
        <>
            <div className="mb-12 ml-4 mr-4">
                <ProposalStageTimeline currentStage={proposal.stage} />
            </div>

            <Card className="mb-6">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                        <div className="flex items-center space-x-2">
                            <div className="mb-1 text-2xl font-semibold">{proposal.name}</div>
                            <Badge className={`${getStageBadgeColor(proposal.stage)}`}>
                                {proposal.stage.charAt(0).toUpperCase() + proposal.stage.slice(1)}
                            </Badge>
                        </div>
                        {/* <CardDescription className="mt-1">
                            Created by {proposal.author.name}{" "}
                            {proposal.createdAt &&
                                formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                        </CardDescription> */}
                    </div>

                    {canEdit && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleEdit}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </CardHeader>

                <CardContent className="pt-4">
                    {/* <div className="mb-6">
                    <ProposalStageTimeline currentStage={proposal.stage} />
                </div> */}

                    {proposal.outcome && proposal.outcomeReason && (
                        <div
                            className={cn(
                                "mb-4 rounded-md p-3",
                                proposal.outcome === "accepted"
                                    ? "bg-green-50 text-green-800"
                                    : "bg-red-50 text-red-800",
                            )}
                        >
                            <p className="font-medium">
                                {proposal.outcome === "accepted" ? "Accepted" : "Rejected"}: {proposal.outcomeReason}
                            </p>
                        </div>
                    )}

                    <div className="prose max-w-none">
                        <RichText content={proposal.description}></RichText>
                    </div>

                    {proposal.stage === "voting" && (
                        <div className="mt-6">
                            <h3 className="mb-2 text-lg font-medium">Voting Results</h3>
                            <div className="flex items-center space-x-2">
                                <Heart className="h-5 w-5 text-pink-500" />
                                <span>
                                    {voteCount} vote{voteCount !== 1 ? "s" : ""}
                                </span>
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-between">
                    <div className="flex cursor-pointer items-center" onClick={openCircle}>
                        <UserPicture name={proposal.author.name} picture={proposal.author.picture?.url} size="32px" />
                        <span className="ml-2">{proposal.author.name}</span>
                    </div>

                    {renderStageActions()}
                </CardFooter>

                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Proposal</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete this proposal? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>Delete</>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </Card>
        </>
    );
};

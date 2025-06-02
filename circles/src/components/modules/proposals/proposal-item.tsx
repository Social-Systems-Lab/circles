"use client";

import React, { useState, useTransition } from "react"; // Removed useEffect
import { Circle, ContentPreviewData, ProposalDisplay, ProposalStage } from "@/models/models"; // Removed GoalDisplay, it's part of ProposalDisplay.linkedGoal
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalStageTimeline } from "./proposal-stage-timeline";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, Loader2, MoreHorizontal, Pencil, Trash2, MapPin, LinkIcon } from "lucide-react"; // Added LinkIcon
import { formatDistanceToNow } from "date-fns";
import { UserPicture } from "../members/user-picture";
import { cn, getFullLocationName } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import ImageThumbnailCarousel from "@/components/ui/image-thumbnail-carousel";
import {
    changeProposalStageAction,
    deleteProposalAction,
    voteOnProposalAction,
} from "@/app/circles/[handle]/proposals/actions";
// Removed: import { getGoalAction } from "@/app/circles/[handle]/goals/actions";
import { CommentSection } from "../feeds/CommentSection";
import CreateGoalDialog from "@/components/global-create/create-goal-dialog"; // Import CreateGoalDialog

interface ProposalItemProps {
    proposal: ProposalDisplay;
    circle: Circle;
    isPreview?: boolean;
}

const getStageBadgeColor = (stage: ProposalStage) => {
    switch (stage) {
        case "draft":
            return "bg-gray-200 text-gray-800";
        case "review":
            return "bg-blue-200 text-blue-800";
        case "voting":
            return "bg-green-200 text-green-800";
        case "accepted":
            return "bg-teal-200 text-teal-800";
        case "implemented":
            return "bg-indigo-200 text-indigo-800";
        case "rejected":
            return "bg-red-200 text-red-800";
        default:
            return "bg-gray-200 text-gray-800";
    }
};

export const ProposalItem: React.FC<ProposalItemProps> = ({ proposal, circle, isPreview = false }) => {
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [submitReviewDialogOpen, setSubmitReviewDialogOpen] = useState(false);
    const [rejectReviewDialogOpen, setRejectReviewDialogOpen] = useState(false);
    const [approveVotingDialogOpen, setApproveVotingDialogOpen] = useState(false);
    const [rejectVotingDialogOpen, setRejectVotingDialogOpen] = useState(false);
    const [acceptVotingDialogOpen, setAcceptVotingDialogOpen] = useState(false);
    const [createGoalDialogOpen, setCreateGoalDialogOpen] = useState(false); // State for Create Goal Dialog
    const [resolutionReason, setResolutionReason] = useState("");
    const [isVoting, setIsVoting] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isCompact = useIsCompact();
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    // Removed: const [linkedGoal, setLinkedGoal] = useState<GoalDisplay | null>(null);
    // Removed: const [isLoadingGoal, setIsLoadingGoal] = useState(false);

    const isAuthor = user?.did === proposal.createdBy;
    const canModerate = isAuthorized(user, circle, features.proposals.moderate);
    const canEdit = (isAuthor && (proposal.stage === "draft" || proposal.stage === "review")) || canModerate;
    const canReview = isAuthorized(user, circle, features.proposals.review);
    const canVote = isAuthorized(user, circle, features.proposals.vote);
    const canResolve = isAuthorized(user, circle, features.proposals.resolve);
    const hasVoted = !!proposal.userReaction;
    const voteCount = Object.values(proposal.reactions || {}).reduce((sum, count) => sum + count, 0);

    // Removed useEffect for fetching linkedGoal

    const handleEdit = () => router.push(`/circles/${circle.handle}/proposals/${proposal._id}/edit`);

    const handleDelete = async () => {
        startTransition(async () => {
            const result = await deleteProposalAction(circle.handle!, proposal._id);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.push(`/circles/${circle.handle}/proposals`);
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete proposal",
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
            const result = await voteOnProposalAction(circle.handle!, proposal._id, hasVoted ? null : "like");
            if (result.success) {
                toast({ title: hasVoted ? "Vote removed" : "Vote added", description: result.message });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to process your vote",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
        } finally {
            setIsVoting(false);
        }
    };

    const handleStageChange = async (
        newStage: ProposalStage,
        options?: { outcome?: "accepted" | "rejected"; outcomeReason?: string; goalId?: string },
    ) => {
        startTransition(async () => {
            const result = await changeProposalStageAction(circle.handle!, proposal._id, newStage, options);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update proposal stage",
                    variant: "destructive",
                });
            }
        });
    };

    const confirmSubmitForReview = () => {
        handleStageChange("review");
        setSubmitReviewDialogOpen(false);
    };
    const confirmRejectReview = () => {
        handleStageChange("rejected", { outcome: "rejected", outcomeReason: resolutionReason.trim() });
        setRejectReviewDialogOpen(false);
        setResolutionReason("");
    };
    const confirmApproveVoting = () => {
        handleStageChange("voting");
        setApproveVotingDialogOpen(false);
    };
    const confirmRejectVoting = () => {
        handleStageChange("rejected", { outcome: "rejected", outcomeReason: resolutionReason.trim() });
        setRejectVotingDialogOpen(false);
        setResolutionReason("");
    };
    const confirmAcceptVoting = () => {
        handleStageChange("accepted", { outcome: "accepted", outcomeReason: resolutionReason.trim() });
        setAcceptVotingDialogOpen(false);
        setResolutionReason("");
    };

    const openCircle = () => {
        if (isCompact) {
            router.push(`/circles/${proposal.author.handle}`);
            return;
        }
        let contentPreviewData: ContentPreviewData = { type: "user", content: proposal.author };
        setContentPreview((x) =>
            x?.content === proposal.author && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const renderAuthorActions = () => {
        if (proposal.stage === "draft" && isAuthor && !isPreview) {
            return (
                <div className="mb-4 flex space-x-2">
                    <Button onClick={() => setSubmitReviewDialogOpen(true)} disabled={isPending}>
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                            </>
                        ) : (
                            "Submit for Review"
                        )}
                    </Button>
                </div>
            );
        }
        return null;
    };

    const renderVotingActions = () => {
        if (proposal.stage === "voting" && canVote && !isPreview) {
            return (
                <div className="my-4">
                    <h3 className="mb-2 text-lg font-medium">Your Vote</h3>
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
                        {isVoting ? "Processing..." : hasVoted ? "Voted" : "Vote"} ({voteCount} total)
                    </Button>
                </div>
            );
        }
        return null;
    };

    const renderDecisionZoneActions = () => {
        const decisionActions: React.ReactNode[] = [];
        if (isPreview) return null; // No decision zone in preview

        switch (proposal.stage) {
            case "review":
                if (canReview || canModerate) {
                    decisionActions.push(
                        <Button
                            key="reject-review"
                            variant="destructive"
                            onClick={() => setRejectReviewDialogOpen(true)}
                            disabled={isPending}
                        >
                            Reject
                        </Button>,
                        <Button
                            key="approve-voting"
                            onClick={() => setApproveVotingDialogOpen(true)}
                            disabled={isPending}
                        >
                            Approve for Voting
                        </Button>,
                    );
                }
                break;
            case "voting":
                if (canResolve || canModerate) {
                    decisionActions.push(
                        <Button
                            key="reject-voting"
                            variant="destructive"
                            onClick={() => setRejectVotingDialogOpen(true)}
                            disabled={isPending}
                        >
                            Reject
                        </Button>,
                        <Button
                            key="accept-voting"
                            onClick={() => setAcceptVotingDialogOpen(true)}
                            disabled={isPending}
                        >
                            Accept (Move to Ranking)
                        </Button>,
                    );
                }
                break;
            case "accepted":
                if (canResolve || canModerate) {
                    decisionActions.push(
                        <Button key="implement" onClick={() => setCreateGoalDialogOpen(true)} disabled={isPending}>
                            Implement as Goal
                        </Button>,
                        <Button
                            key="reject-accepted" // Placeholder for now, will be a dialog later
                            variant="destructive"
                            onClick={() => alert("Reject Accepted Proposal - TBD")} // TODO: Implement reject dialog
                            disabled={isPending}
                        >
                            Reject
                        </Button>,
                    );
                }
                break;
        }

        if (decisionActions.length === 0) return null;
        return (
            <div className="mt-6 rounded-lg border bg-slate-50 p-4">
                <h3 className="text-md mb-3 font-semibold text-slate-700">Decision Zone</h3>
                <div className="flex flex-wrap gap-2">{decisionActions}</div>
            </div>
        );
    };

    const MainContent = (
        <>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                    <div className="mb-2 flex items-center space-x-2">
                        <Link
                            href={`/circles/${circle.handle}/proposals/${proposal._id}`}
                            onClick={(e: React.MouseEvent) => !isPreview && e.stopPropagation()}
                            className={isPreview ? "pointer-events-none" : ""}
                        >
                            <h1>{proposal.name}</h1>
                        </Link>
                        <Badge className={`${getStageBadgeColor(proposal.stage)}`}>
                            {proposal.stage.charAt(0).toUpperCase() + proposal.stage.slice(1)}
                        </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <div>
                            Created by {proposal.author.name}{" "}
                            {proposal.createdAt &&
                                formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                        </div>
                        {proposal.location && (
                            <>
                                <span className="mx-1">·</span>
                                <div className="flex items-center">
                                    <MapPin className="mr-1 h-3 w-3" />
                                    <span>{getFullLocationName(proposal.location)}</span>
                                </div>
                            </>
                        )}
                        {proposal.stage === "implemented" && proposal.linkedGoal && (
                            <>
                                <span className="mx-1">·</span>
                                <div className="flex items-center">
                                    <LinkIcon className="mr-1 h-3 w-3" />
                                    Implemented as Goal:{" "}
                                    <Link
                                        href={`/circles/${circle.handle}/goals/${proposal.linkedGoal._id}`}
                                        className="ml-1 text-indigo-600 hover:underline"
                                    >
                                        {proposal.linkedGoal.title}
                                    </Link>
                                </div>
                            </>
                        )}
                        {/* isLoadingGoal state is removed, so this loading indicator is also removed */}
                        {proposal.stage === "rejected" && proposal.outcomeReason && (
                            <>
                                <span className="mx-1">·</span>
                                <span>Reason: {proposal.outcomeReason}</span>
                            </>
                        )}
                    </div>
                </div>
                {canEdit && !isPreview && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            {(isAuthor && (proposal.stage === "draft" || proposal.stage === "review")) ||
                            canModerate ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleEdit}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                            {(isAuthor || canModerate) && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => setDeleteDialogOpen(true)}
                                        className="text-red-600"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </CardHeader>
            <CardContent className="pt-4">
                {proposal.outcome && (proposal.stage === "rejected" || proposal.stage === "implemented") && (
                    <div
                        className={cn(
                            "mb-4 rounded-md p-3",
                            proposal.outcome === "accepted" || proposal.stage === "implemented"
                                ? "bg-green-50 text-green-800"
                                : "bg-red-50 text-red-800",
                        )}
                    >
                        <span className="font-medium">
                            {proposal.stage === "implemented"
                                ? "Implemented"
                                : proposal.outcome === "accepted"
                                  ? "Accepted"
                                  : "Rejected"}
                            {proposal.resolvedAtStage &&
                                ` from ${proposal.resolvedAtStage.charAt(0).toUpperCase() + proposal.resolvedAtStage.slice(1)} Stage`}
                        </span>
                        {proposal.outcomeReason && `: ${proposal.outcomeReason}`}
                    </div>
                )}
                <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 text-lg font-semibold text-blue-800">Proposed Decision</div>
                    <div className="prose prose-sm max-w-none text-blue-900">
                        <RichText content={proposal.decisionText} />
                    </div>
                </div>
                {((proposal.images && proposal.images.length > 0) || proposal.background) && (
                    <div className="mb-6">
                        <h3 className="mb-2 text-lg font-semibold">Background</h3>
                        {proposal.images && proposal.images.length > 0 && (
                            <div className="mb-4">
                                <ImageThumbnailCarousel images={proposal.images} className="w-full" />
                            </div>
                        )}
                        <div className="prose max-w-none">
                            <RichText content={proposal.background} />
                        </div>
                    </div>
                )}
                {!isPreview && renderAuthorActions()}
                {!isPreview && renderVotingActions()}
                {!isPreview && renderDecisionZoneActions()}
                {!isPreview && proposal.commentPostId && (
                    <div className="mt-8 border-t pt-6">
                        <CommentSection postId={proposal.commentPostId} circle={circle} user={user ?? null} />
                    </div>
                )}
            </CardContent>
            <CardFooter className={`flex items-start justify-between ${isPreview ? "hidden" : ""}`}>
                <div className={`flex cursor-pointer items-center`} onClick={openCircle}>
                    <UserPicture name={proposal.author.name} picture={proposal.author.picture?.url} size="32px" />
                    <span className="ml-2">{proposal.author.name}</span>
                </div>
            </CardFooter>
        </>
    );

    return (
        <div className="formatted">
            {!isPreview && (
                <div className="mb-12 ml-4 mr-4">
                    <ProposalStageTimeline
                        currentStage={proposal.stage}
                        outcome={proposal.outcome}
                        resolvedAtStage={proposal.resolvedAtStage}
                    />
                </div>
            )}
            {isPreview ? <div>{MainContent}</div> : <Card className="mb-6">{MainContent}</Card>}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()}>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                                </>
                            ) : (
                                "Delete"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={submitReviewDialogOpen} onOpenChange={setSubmitReviewDialogOpen}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>Submit for Review?</DialogTitle>
                        <DialogDescription>
                            Once submitted for review, the proposal can no longer be edited. Are you sure you want to
                            proceed?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={confirmSubmitForReview} disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                                </>
                            ) : (
                                "Confirm Submit"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={rejectReviewDialogOpen} onOpenChange={setRejectReviewDialogOpen}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>Reject Proposal?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to reject this proposal? It will be moved to the Resolved stage. You
                            can optionally provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Label htmlFor="resolution-reason-reject-review">Reason (Optional)</Label>
                        <Textarea
                            id="resolution-reason-reject-review"
                            value={resolutionReason}
                            onChange={(e) => setResolutionReason(e.target.value)}
                            placeholder="Enter reason for rejection..."
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={confirmRejectReview} disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rejecting...
                                </>
                            ) : (
                                "Confirm Reject"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={approveVotingDialogOpen} onOpenChange={setApproveVotingDialogOpen}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>Approve for Voting?</DialogTitle>
                        <DialogDescription>
                            This will move the proposal to the Voting stage. Are you sure?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={confirmApproveVoting} disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...
                                </>
                            ) : (
                                "Confirm Approve"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={rejectVotingDialogOpen} onOpenChange={setRejectVotingDialogOpen}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>Reject Proposal?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to reject this proposal after the voting period? It will be moved to
                            the Resolved stage. You can optionally provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Label htmlFor="resolution-reason-reject">Reason (Optional)</Label>
                        <Textarea
                            id="resolution-reason-reject"
                            value={resolutionReason}
                            onChange={(e) => setResolutionReason(e.target.value)}
                            placeholder="Enter reason for rejection..."
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={confirmRejectVoting} disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rejecting...
                                </>
                            ) : (
                                "Confirm Reject"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={acceptVotingDialogOpen} onOpenChange={setAcceptVotingDialogOpen}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>Accept Proposal?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to accept this proposal after the voting period? It will be moved to
                            the Resolved stage. You can optionally provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Label htmlFor="resolution-reason-accept">Reason (Optional)</Label>
                        <Textarea
                            id="resolution-reason-accept"
                            value={resolutionReason}
                            onChange={(e) => setResolutionReason(e.target.value)}
                            placeholder="Enter reason for acceptance..."
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={confirmAcceptVoting} disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accepting...
                                </>
                            ) : (
                                "Confirm Accept"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Goal Dialog from Proposal */}
            {proposal && (
                <CreateGoalDialog
                    isOpen={createGoalDialogOpen}
                    onOpenChange={setCreateGoalDialogOpen}
                    itemKey="goal"
                    proposal={proposal}
                    circle={circle} // Pass the circle from ProposalItemProps
                    onSuccess={(goalId) => {
                        toast({ title: "Success", description: "Goal created from proposal." });
                        setCreateGoalDialogOpen(false);
                        // router.refresh(); // Refresh might not be needed if navigating away
                        if (goalId && circle?.handle) {
                            router.push(`/circles/${circle.handle}/goals/${goalId}`);
                        } else {
                            router.refresh(); // Fallback to refresh if navigation details are missing
                        }
                    }}
                />
            )}
        </div>
    );
};

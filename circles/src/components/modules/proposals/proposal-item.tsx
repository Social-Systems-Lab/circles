"use client";

import React, { useState, useTransition } from "react";
import { Circle, ContentPreviewData, ProposalDisplay, ProposalStage } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalStageTimeline } from "./proposal-stage-timeline";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import Link from "next/link"; // Import Link
import { Heart, Loader2, MoreHorizontal, Pencil, Trash2, MapPin } from "lucide-react"; // Added MapPin
import { formatDistanceToNow } from "date-fns";
import { UserPicture } from "../members/user-picture";
import { cn, getFullLocationName } from "@/lib/utils"; // Added getFullLocationName
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
import ImageCarousel from "@/components/ui/image-carousel";
import ImageThumbnailCarousel from "@/components/ui/image-thumbnail-carousel"; // Import the new thumbnail carousel
import {
    changeProposalStageAction,
    deleteProposalAction,
    voteOnProposalAction,
} from "@/app/circles/[handle]/proposals/actions";
import { CommentSection } from "../feeds/CommentSection"; // Import CommentSection

interface ProposalItemProps {
    proposal: ProposalDisplay;
    circle: Circle;
    isPreview?: boolean; // Add isPreview prop
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

export const ProposalItem: React.FC<ProposalItemProps> = ({ proposal, circle, isPreview = false }) => {
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [submitReviewDialogOpen, setSubmitReviewDialogOpen] = useState(false);
    const [rejectReviewDialogOpen, setRejectReviewDialogOpen] = useState(false);
    const [approveVotingDialogOpen, setApproveVotingDialogOpen] = useState(false);
    const [rejectVotingDialogOpen, setRejectVotingDialogOpen] = useState(false); // State for reject confirmation (voting)
    const [acceptVotingDialogOpen, setAcceptVotingDialogOpen] = useState(false); // State for accept confirmation (voting)
    const [resolutionReason, setResolutionReason] = useState(""); // State for accept/reject reason (voting)
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
            const result = await deleteProposalAction(circle.handle!, proposal._id);

            if (result.success) {
                toast({
                    title: "Success",
                    description: result.message,
                });
                router.push(`/circles/${circle.handle}/proposals`); // Redirect after delete
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
                toast({
                    title: hasVoted ? "Vote removed" : "Vote added",
                    description: result.message,
                });
                router.refresh(); // Refresh to show updated vote count/status
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to process your vote",
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

    const handleStageChange = async (
        newStage: ProposalStage,
        outcome?: "accepted" | "rejected",
        outcomeReason?: string,
    ) => {
        startTransition(async () => {
            const result = await changeProposalStageAction(
                circle.handle!,
                proposal._id,
                newStage,
                outcome,
                outcomeReason,
            );

            if (result.success) {
                toast({
                    title: "Success",
                    description: result.message,
                });
                router.refresh(); // Refresh to show the new stage
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
        handleStageChange("resolved", "rejected", resolutionReason.trim());
        setRejectReviewDialogOpen(false);
        setResolutionReason(""); // Reset reason
    };

    const confirmApproveVoting = () => {
        handleStageChange("voting");
        setApproveVotingDialogOpen(false);
    };

    const confirmRejectVoting = () => {
        handleStageChange("resolved", "rejected", resolutionReason.trim());
        setRejectVotingDialogOpen(false);
        setResolutionReason(""); // Reset reason
    };

    const confirmAcceptVoting = () => {
        handleStageChange("resolved", "accepted", resolutionReason.trim());
        setAcceptVotingDialogOpen(false);
        setResolutionReason(""); // Reset reason
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
                            {/* Open confirmation dialog instead of directly changing stage */}
                            <Button onClick={() => setSubmitReviewDialogOpen(true)} disabled={isPending}>
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
                            {/* <Button
                                variant="destructive"
                                onClick={() => handleStageChange("draft")}
                                disabled={isPending}
                            >
                                Withdraw from Review
                            </Button> */}
                            {/* Open reject confirmation dialog */}
                            <Button
                                variant="destructive"
                                onClick={() => setRejectReviewDialogOpen(true)}
                                disabled={isPending}
                            >
                                Reject
                            </Button>
                            {/* Open approve confirmation dialog */}
                            <Button onClick={() => setApproveVotingDialogOpen(true)} disabled={isPending}>
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
                                {/* Open reject dialog */}
                                <Button
                                    variant="destructive"
                                    onClick={() => setRejectVotingDialogOpen(true)}
                                    disabled={isPending}
                                >
                                    Reject
                                </Button>
                                {/* Open accept dialog */}
                                <Button onClick={() => setAcceptVotingDialogOpen(true)} disabled={isPending}>
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

    const MainContent = (
        <>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                    <div className="mb-2 flex items-center space-x-2">
                        {/* Link only if not in preview */}
                        <Link
                            href={`/circles/${circle.handle}/proposals/${proposal._id}`}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()} // Add type for event
                        >
                            <h1>{proposal.name}</h1>
                        </Link>
                        <Badge className={`${getStageBadgeColor(proposal.stage)}`}>
                            {proposal.stage.charAt(0).toUpperCase() + proposal.stage.slice(1)}
                        </Badge>
                    </div>
                    <div className="mt-1 flex items-center space-x-2 text-xs text-muted-foreground">
                        <div>
                            Created by {proposal.author.name}{" "}
                            {proposal.createdAt &&
                                formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                        </div>
                        {/* Display Location if available */}
                        {proposal.location && (
                            <>
                                <span>·</span>
                                <div className="flex items-center">
                                    <MapPin className="mr-1 h-3 w-3" />
                                    <span>{getFullLocationName(proposal.location)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Hide dropdown menu in preview */}
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
                            proposal.outcome === "accepted" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800",
                        )}
                    >
                        <span className="font-medium">
                            {proposal.outcome === "accepted" ? "Accepted" : "Rejected"}
                            {proposal.resolvedAtStage &&
                                ` during ${proposal.resolvedAtStage.charAt(0).toUpperCase() + proposal.resolvedAtStage.slice(1)} Stage`}
                        </span>
                        {proposal.outcomeReason && `: ${proposal.outcomeReason}`}
                    </div>
                )}

                {/* Decision Text Section */}
                <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 text-lg font-semibold text-blue-800">Proposed Decision</div>
                    <div className="prose prose-sm max-w-none text-blue-900">
                        <RichText content={proposal.decisionText} />
                    </div>
                </div>

                {/* Background & Images Section */}
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

                {/* --- Comment Section --- */}
                {/* Render comments only if not in preview mode and commentPostId exists */}
                {!isPreview && proposal.commentPostId && (
                    <CommentSection
                        postId={proposal.commentPostId}
                        circle={circle}
                        user={user ?? null} // Convert undefined from atom to null
                        // initialCommentCount={proposal.comments || 0} // Pass if comment count is added to ProposalDisplay
                    />
                )}
                {/* Optional: Show a message if comments aren't available */}
                {/* {!isPreview && !proposal.commentPostId && (
                     <div className="mt-8 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Comments</h3>
                        <div className="text-sm text-gray-500">Comments are not available for this proposal.</div>
                    </div>
                )} */}
                {/* --- End Comment Section --- */}
            </CardContent>

            <CardFooter className={`flex items-start justify-between ${isPreview ? "flex-col gap-4" : ""}`}>
                <div className={`flex cursor-pointer items-center`} onClick={openCircle}>
                    <UserPicture name={proposal.author.name} picture={proposal.author.picture?.url} size="32px" />
                    <span className="ml-2">{proposal.author.name}</span>
                </div>
                {/* Hide stage actions in preview */}
                {renderStageActions()}
            </CardFooter>
            {/* </Card> Rendered conditionally below */}
        </>
    ); // End of MainContent definition

    return (
        <div className="formatted">
            {/* Conditionally render timeline */}
            {!isPreview && (
                <div className="mb-12 ml-4 mr-4">
                    <ProposalStageTimeline
                        currentStage={proposal.stage}
                        outcome={proposal.outcome}
                        resolvedAtStage={proposal.resolvedAtStage}
                    />
                </div>
            )}

            {/* Conditionally render Card wrapper */}
            {isPreview ? (
                // Added overflow-y-auto, max-h-[70vh], and custom-scrollbar class for preview scrolling
                <div>{MainContent}</div>
            ) : (
                <Card className="mb-6">{MainContent}</Card>
            )}

            {/* Render Dialogs here, outside MainContent but within the main return, only if not in preview */}
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

            {/* Submit for Review Confirmation Dialog */}
            <Dialog open={submitReviewDialogOpen} onOpenChange={setSubmitReviewDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>Confirm Submit</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Review Confirmation Dialog */}
            <Dialog open={rejectReviewDialogOpen} onOpenChange={setRejectReviewDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                </>
                            ) : (
                                <>Confirm Reject</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve for Voting Confirmation Dialog */}
            <Dialog open={approveVotingDialogOpen} onOpenChange={setApproveVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Approving...
                                </>
                            ) : (
                                <>Confirm Approve</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Voting Confirmation Dialog */}
            <Dialog open={rejectVotingDialogOpen} onOpenChange={setRejectVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                </>
                            ) : (
                                <>Confirm Reject</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Accept Voting Confirmation Dialog */}
            <Dialog open={acceptVotingDialogOpen} onOpenChange={setAcceptVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Accepting...
                                </>
                            ) : (
                                <>Confirm Accept</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Submit for Review Confirmation Dialog */}
            <Dialog open={submitReviewDialogOpen} onOpenChange={setSubmitReviewDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>Confirm Submit</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Review Confirmation Dialog */}
            <Dialog open={rejectReviewDialogOpen} onOpenChange={setRejectReviewDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                </>
                            ) : (
                                <>Confirm Reject</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve for Voting Confirmation Dialog */}
            <Dialog open={approveVotingDialogOpen} onOpenChange={setApproveVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Approving...
                                </>
                            ) : (
                                <>Confirm Approve</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Voting Confirmation Dialog */}
            <Dialog open={rejectVotingDialogOpen} onOpenChange={setRejectVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                </>
                            ) : (
                                <>Confirm Reject</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Accept Voting Confirmation Dialog */}
            <Dialog open={acceptVotingDialogOpen} onOpenChange={setAcceptVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Accepting...
                                </>
                            ) : (
                                <>Confirm Accept</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Submit for Review Confirmation Dialog */}
            <Dialog open={submitReviewDialogOpen} onOpenChange={setSubmitReviewDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>Confirm Submit</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Review Confirmation Dialog */}
            <Dialog open={rejectReviewDialogOpen} onOpenChange={setRejectReviewDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                </>
                            ) : (
                                <>Confirm Reject</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve for Voting Confirmation Dialog */}
            <Dialog open={approveVotingDialogOpen} onOpenChange={setApproveVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Approving...
                                </>
                            ) : (
                                <>Confirm Approve</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Voting Confirmation Dialog */}
            <Dialog open={rejectVotingDialogOpen} onOpenChange={setRejectVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                </>
                            ) : (
                                <>Confirm Reject</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Accept Voting Confirmation Dialog */}
            <Dialog open={acceptVotingDialogOpen} onOpenChange={setAcceptVotingDialogOpen}>
                <DialogContent>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Accepting...
                                </>
                            ) : (
                                <>Confirm Accept</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

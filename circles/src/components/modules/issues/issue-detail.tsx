"use client";

import React, { useState, useTransition, useEffect } from "react"; // Added useEffect
import { Circle, IssueDisplay, IssueStage, MemberDisplay } from "@/models/models"; // Added MemberDisplay
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Trash2, MapPin, User, CheckCircle, Clock, Play, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { UserPicture } from "../members/user-picture";
import { cn, getFullLocationName } from "@/lib/utils";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
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
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import RichText from "../feeds/RichText"; // Assuming RichText can be reused
import ImageThumbnailCarousel from "@/components/ui/image-thumbnail-carousel";
import {
    changeIssueStageAction,
    assignIssueAction,
    deleteIssueAction,
    getMembersAction,
} from "@/app/circles/[handle]/issues/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { Separator } from "@/components/ui/separator"; // Import Separator
import { CommentSection } from "../feeds/CommentSection"; // Import CommentSection

// Helper function for stage badge styling and icons (copied from issues-list)
const getStageInfo = (stage: IssueStage) => {
    switch (stage) {
        case "review":
            return { color: "bg-yellow-200 text-yellow-800", icon: Clock, text: "Review" };
        case "open":
            return { color: "bg-blue-200 text-blue-800", icon: Play, text: "Open" };
        case "inProgress":
            return { color: "bg-orange-200 text-orange-800", icon: Loader2, text: "In Progress" };
        case "resolved":
            return { color: "bg-green-200 text-green-800", icon: CheckCircle, text: "Resolved" };
        default:
            return { color: "bg-gray-200 text-gray-800", icon: Clock, text: "Unknown" };
    }
};

// Define Permissions type based on what IssueDetailPage passes
type IssuePermissions = {
    canModerate: boolean;
    canReview: boolean;
    canAssign: boolean;
    canResolve: boolean;
    canComment: boolean;
};

interface IssueDetailProps {
    issue: IssueDisplay;
    circle: Circle;
    permissions: IssuePermissions;
    currentUserDid: string;
    isPreview?: boolean; // Add isPreview prop
}

const IssueDetail: React.FC<IssueDetailProps> = ({ issue, circle, permissions, currentUserDid, isPreview = false }) => {
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [stageChangeDialogOpen, setStageChangeDialogOpen] = useState(false);
    const [targetStage, setTargetStage] = useState<IssueStage | null>(null);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [members, setMembers] = useState<MemberDisplay[]>([]); // Changed type to MemberDisplay[]
    const [selectedAssigneeDid, setSelectedAssigneeDid] = useState<string | undefined>(issue.assignedTo);
    const { toast } = useToast();
    const router = useRouter();

    const isAuthor = currentUserDid === issue.createdBy;
    const isAssignee = currentUserDid === issue.assignedTo;

    // Fetch members when assign dialog opens
    useEffect(() => {
        if (assignDialogOpen) {
            const fetchMembers = async () => {
                try {
                    const result = await getMembersAction(circle._id as string);
                    if (Array.isArray(result)) {
                        setMembers(result);
                    } else {
                        // Handle potential error object returned by the action
                        console.error("Failed to fetch members:", result.message);
                        toast({
                            title: "Error",
                            description: result.message || "Could not load members list.",
                            variant: "destructive",
                        });
                        setMembers([]); // Reset members list on error
                    }
                } catch (error) {
                    // Catch unexpected errors during the fetch
                    console.error("Failed to fetch members (catch block):", error);
                    toast({
                        title: "Error",
                        description: "An unexpected error occurred while fetching members.",
                        variant: "destructive",
                    });
                    setMembers([]); // Reset members list on error
                }
            };
            fetchMembers();
        }
    }, [assignDialogOpen, circle._id, toast]);

    const handleEdit = () => {
        router.push(`/circles/${circle.handle}/issues/${issue._id}/edit`);
    };

    const handleDelete = async () => {
        startTransition(async () => {
            const result = await deleteIssueAction(circle.handle!, issue._id as string);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.push(`/circles/${circle.handle}/issues`); // Redirect after delete
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete issue",
                    variant: "destructive",
                });
            }
            setDeleteDialogOpen(false);
        });
    };

    const openStageChangeDialog = (stage: IssueStage) => {
        setTargetStage(stage);
        setStageChangeDialogOpen(true);
    };

    const confirmStageChange = () => {
        if (!targetStage) return;
        startTransition(async () => {
            const result = await changeIssueStageAction(circle.handle!, issue._id as string, targetStage);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh to show the new stage
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update issue stage",
                    variant: "destructive",
                });
            }
            setStageChangeDialogOpen(false);
            setTargetStage(null);
        });
    };

    const confirmAssignment = () => {
        startTransition(async () => {
            const formData = new FormData();
            if (selectedAssigneeDid) {
                formData.append("assigneeDid", selectedAssigneeDid);
            } // No need to append if undefined, action handles unassignment

            const result = await assignIssueAction(circle.handle!, issue._id as string, formData);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh to show new assignee
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to assign issue",
                    variant: "destructive",
                });
            }
            setAssignDialogOpen(false);
        });
    };

    const { color: stageColor, icon: StageIcon, text: stageText } = getStageInfo(issue.stage);

    // Determine available stage transitions based on current stage and permissions
    const availableStageActions: { label: string; stage: IssueStage; allowed: boolean }[] = [
        {
            label: "Approve (Open)",
            stage: "open" as IssueStage,
            allowed: permissions.canReview && issue.stage === "review",
        }, // Added type assertion
        {
            label: "Start Progress",
            stage: "inProgress" as IssueStage, // Added type assertion
            allowed: (permissions.canResolve || isAssignee) && issue.stage === "open",
        },
        {
            label: "Mark Resolved",
            stage: "resolved" as IssueStage, // Added type assertion
            allowed: (permissions.canResolve || isAssignee) && issue.stage === "inProgress",
        },
        {
            label: "Re-open",
            stage: "open" as IssueStage, // Added type assertion
            allowed: permissions.canResolve && (issue.stage === "resolved" || issue.stage === "inProgress"),
        }, // Allow re-opening
    ].filter((action) => action.allowed);

    const canEditIssue = (isAuthor && issue.stage === "review") || permissions.canModerate;
    const canDeleteIssue = isAuthor || permissions.canModerate;

    // Function to render primary action buttons based on stage and permissions
    const renderIssueActions = () => {
        const actions = [];

        // Stage change actions
        if (permissions.canReview && issue.stage === "review") {
            actions.push(
                <Button key="approve" onClick={() => openStageChangeDialog("open")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Approve (Open)
                </Button>,
            );
        }
        if ((permissions.canResolve || isAssignee) && issue.stage === "open") {
            actions.push(
                <Button key="start" onClick={() => openStageChangeDialog("inProgress")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Start Progress
                </Button>,
            );
        }
        if ((permissions.canResolve || isAssignee) && issue.stage === "inProgress") {
            actions.push(
                <Button key="resolve" onClick={() => openStageChangeDialog("resolved")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Mark Resolved
                </Button>,
            );
        }
        if (permissions.canResolve && (issue.stage === "resolved" || issue.stage === "inProgress")) {
            actions.push(
                <Button
                    key="reopen"
                    variant="outline"
                    onClick={() => openStageChangeDialog("open")}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Re-open Issue
                </Button>,
            );
        }

        // Assign action button
        if (permissions.canAssign) {
            actions.push(
                <Button
                    key="assign"
                    variant="outline"
                    onClick={() => setAssignDialogOpen(true)}
                    disabled={isPending}
                    className="flex items-center gap-2"
                >
                    <User className="h-4 w-4" />
                    {issue.assignee ? (
                        <>
                            Assigned to:
                            <UserPicture name={issue.assignee.name} picture={issue.assignee.picture?.url} size="20px" />
                            {issue.assignee.name}
                        </>
                    ) : (
                        "Assign Issue"
                    )}
                </Button>,
            );
        }

        if (actions.length === 0) {
            return null; // No actions available
        }

        return <div className="flex flex-wrap items-center gap-2">{actions}</div>;
    };

    // Define the main content structure
    const mainContent = (
        <>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                    <div className="mb-2 flex items-center space-x-2">
                        {/* Link only if not in preview */}
                        {isPreview ? (
                            <h1>{issue.title}</h1>
                        ) : (
                            <Link
                                href={`/circles/${circle.handle}/issues/${issue._id}`}
                                onClick={(e: React.MouseEvent) => e.stopPropagation()} // Add type for event
                            >
                                <h1>{issue.title}</h1>
                            </Link>
                        )}
                        <Badge className={`${stageColor} items-center gap-1`}>
                            <StageIcon className="h-3 w-3" />
                            {stageText}
                        </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center">
                            <User className="mr-1 h-3 w-3" />
                            Created by {issue.author.name}{" "}
                            {issue.createdAt && formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}
                        </div>
                        {issue.assignee && (
                            <div className="flex items-center">
                                <User className="mr-1 h-3 w-3 text-blue-600" />
                                Assigned to {issue.assignee.name}
                            </div>
                        )}
                        {issue.location && (
                            <div className="flex items-center">
                                <MapPin className="mr-1 h-3 w-3" />
                                {getFullLocationName(issue.location)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions Dropdown - Conditionally render if not in preview? Or keep for consistency? Keeping for now. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Options</DropdownMenuLabel>
                        {/* Edit Action */}
                        {canEditIssue && (
                            <DropdownMenuItem onClick={handleEdit} disabled={issue.stage === "resolved"}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit Issue
                            </DropdownMenuItem>
                        )}
                        {/* Delete Action */}
                        {canDeleteIssue && (
                            <>
                                {canEditIssue && <DropdownMenuSeparator />}
                                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Issue
                                </DropdownMenuItem>
                            </>
                        )}
                        {/* Show message if no actions */}
                        {!canEditIssue && !canDeleteIssue && (
                            <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>

            <CardContent className="pt-4">
                {/* Description */}
                <div className="mb-6">
                    <h3 className="mb-2 text-lg font-semibold">Description</h3>
                    <div className="prose max-w-none">
                        <RichText content={issue.description} />
                    </div>
                </div>

                {/* Images */}
                {issue.images && issue.images.length > 0 && (
                    <div className="mb-6">
                        <h3 className="mb-2 text-lg font-semibold">Images</h3>
                        <ImageThumbnailCarousel images={issue.images} className="w-full" />
                    </div>
                )}

                {/* Action Buttons Section */}
                {renderIssueActions() && (
                    <div className="mt-6 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Actions</h3>
                        {renderIssueActions()}
                    </div>
                )}

                {/* --- Comment Section --- */}
                {issue.commentPostId && permissions.canComment && (
                    <CommentSection
                        postId={issue.commentPostId}
                        circle={circle}
                        user={user ?? null} // Convert undefined from atom to null
                        // initialCommentCount={issue.comments || 0} // Pass if comment count is added to IssueDisplay
                    />
                )}
                {/* Show message if comments are disabled or no post ID */}
                {(!issue.commentPostId || !permissions.canComment) && (
                    <div className="mt-8 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Comments</h3>
                        <div className="text-sm text-gray-500">
                            {permissions.canComment
                                ? "Comments are not available for this issue yet."
                                : "Comments are disabled or you don't have permission."}
                        </div>
                    </div>
                )}
                {/* --- End Comment Section --- */}
            </CardContent>
            {/* Footer can be used for additional info or actions if needed */}
            {/* <CardFooter></CardFooter> */}
        </>
    );

    return (
        <TooltipProvider>
            {/* Conditionally wrap the main content */}
            {isPreview ? <div className="p-4">{mainContent}</div> : <Card className="mb-6">{mainContent}</Card>}

            {/* Dialogs remain outside the conditional wrapper */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Delete Issue</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this issue? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={stageChangeDialogOpen} onOpenChange={setStageChangeDialogOpen}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Confirm Stage Change</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to move this issue to the &quot;{targetStage}&quot; stage?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={confirmStageChange} disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Assign Issue</DialogTitle>
                        <DialogDescription>
                            Select a member to assign this issue to, or assign it to yourself.
                        </DialogDescription>{" "}
                        {/* Updated description */}
                    </DialogHeader>
                    {/* Wrap Select and Button in a flex container */}
                    <div className="flex items-center gap-2 py-4">
                        {" "}
                        {/* Added flex container */}
                        <Select value={selectedAssigneeDid} onValueChange={setSelectedAssigneeDid}>
                            <SelectTrigger className="flex-grow">
                                {" "}
                                {/* Allow select to grow */}
                                <SelectValue placeholder="Select member or Unassigned" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {members.map((member) => (
                                    // Use userDid instead of did for MemberDisplay
                                    <SelectItem key={member.userDid} value={member.userDid!}>
                                        <div className="flex items-center gap-2">
                                            <UserPicture name={member.name} picture={member.picture?.url} size="24px" />
                                            {member.name}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* Add "Assign to me" button */}
                        <Button
                            variant="outline"
                            onClick={() => setSelectedAssigneeDid(currentUserDid)}
                            disabled={isPending || selectedAssigneeDid === currentUserDid} // Disable if pending or already selected
                        >
                            Assign to me
                        </Button>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={confirmAssignment} disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Assign
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
};

export default IssueDetail;

"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
    Circle,
    GoalDisplay,
    GoalStage,
    GoalPermissions,
    TaskDisplay,
    TaskPermissions,
    ProposalDisplay,
} from "@/models/models"; // Added ProposalDisplay
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import {
    Loader2,
    MoreHorizontal,
    Pencil,
    Trash2,
    MapPin,
    User,
    CheckCircle,
    Clock,
    Play,
    CalendarIcon,
    ListChecks,
    UserPlus, // For Follow icon
    UserCheck, // For Following icon
    LinkIcon, // For proposal link
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { getFullLocationName } from "@/lib/utils";
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
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import RichText from "../feeds/RichText";
import ImageThumbnailCarousel from "@/components/ui/image-thumbnail-carousel";
import {
    changeGoalStageAction,
    deleteGoalAction,
    followGoalAction,
    unfollowGoalAction,
    getGoalFollowDataAction,
} from "@/app/circles/[handle]/goals/actions";
import { getProposalAction } from "@/app/circles/[handle]/proposals/actions"; // Import action to get proposal
import TasksList from "@/components/modules/tasks/tasks-list";
import { TooltipProvider } from "@/components/ui/tooltip";
import Link from "next/link";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import { CommentSection } from "../feeds/CommentSection"; // Import CommentSection

// Helper function for goal stage badge styling
const getGoalStageInfo = (stage: GoalStage) => {
    switch (stage) {
        case "review":
            return {
                color: "bg-yellow-200 text-yellow-800",
                icon: Clock,
                text: "Review",
            };
        case "open":
            return {
                color: "bg-blue-200 text-blue-800",
                icon: Play,
                text: "Open",
            };
        case "resolved":
            return {
                color: "bg-green-200 text-green-800",
                icon: CheckCircle,
                text: "Resolved",
            };
        default:
            return {
                color: "bg-gray-200 text-gray-800",
                icon: Clock,
                text: "Unknown",
            };
    }
};

interface GoalDetailProps {
    goal: GoalDisplay;
    circle: Circle;
    permissions: GoalPermissions; // Goal permissions
    currentUserDid: string;
    isPreview?: boolean;
    // Props passed from server component
    linkedTasks: TaskDisplay[];
    taskPermissions: TaskPermissions | null;
    tasksModuleEnabled: boolean;
    canViewTasks: boolean;
}

const GoalDetail: React.FC<GoalDetailProps> = ({
    goal,
    circle,
    permissions, // Goal permissions
    currentUserDid,
    isPreview = false,
    // Destructure server-passed props
    linkedTasks,
    taskPermissions,
    tasksModuleEnabled,
    canViewTasks,
}) => {
    const [user] = useAtom(userAtom); // Keep userAtom if needed elsewhere
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [stageChangeDialogOpen, setStageChangeDialogOpen] = useState(false);
    const [targetStage, setTargetStage] = useState<GoalStage | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    // Follow state
    const [isFollowingCurrentUser, setIsFollowingCurrentUser] = useState(false); // Placeholder, will be fetched
    const [followersCount, setFollowersCount] = useState(0); // Placeholder, will be fetched
    const [isLoadingFollow, setIsLoadingFollow] = useState(false);
    const [isLoadingInitialFollowStatus, setIsLoadingInitialFollowStatus] = useState(true); // For initial load
    const [linkedProposal, setLinkedProposal] = useState<ProposalDisplay | null>(null);
    const [isLoadingProposal, setIsLoadingProposal] = useState(false);

    const isAuthor = currentUserDid === goal.createdBy;
    const canCreateTask = isAuthorized(user, circle, features.tasks.create);
    const canFollowFeatureEnabled = isAuthorized(user, circle, features.goals.follow);

    // Removed useMemo for tasksModuleEnabled, using prop directly
    // Removed useEffect for fetching tasks and permissions

    useEffect(() => {
        if (goal._id && canFollowFeatureEnabled) {
            setIsLoadingInitialFollowStatus(true);
            getGoalFollowDataAction(goal._id as string)
                .then((data) => {
                    if (data) {
                        setIsFollowingCurrentUser(data.isFollowing);
                        setFollowersCount(data.followerCount);
                    }
                })
                .catch((err) => console.error("Failed to fetch goal follow status", err))
                .finally(() => setIsLoadingInitialFollowStatus(false));
        } else {
            setIsLoadingInitialFollowStatus(false);
        }

        if (goal.proposalId && circle.handle) {
            setIsLoadingProposal(true);
            getProposalAction(circle.handle, goal.proposalId)
                .then((proposalData) => {
                    if (proposalData) {
                        setLinkedProposal(proposalData);
                    }
                })
                .catch((err) => console.error("Failed to fetch linked proposal", err))
                .finally(() => setIsLoadingProposal(false));
        }
    }, [goal._id, goal.proposalId, circle.handle, currentUserDid, canFollowFeatureEnabled]);

    // Filter for active tasks using the prop
    const activeTasks = useMemo(() => {
        return linkedTasks.filter((task) => task.stage === "open" || task.stage === "inProgress");
    }, [linkedTasks]);

    const handleEdit = () => {
        router.push(`/circles/${circle.handle}/goals/${goal._id}/edit`);
    };

    const handleDelete = async () => {
        startTransition(async () => {
            const result = await deleteGoalAction(circle.handle!, goal._id as string);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.push(`/circles/${circle.handle}/goals`);
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete goal",
                    variant: "destructive",
                });
            }
            setDeleteDialogOpen(false);
        });
    };

    const openStageChangeDialog = (stage: GoalStage) => {
        setTargetStage(stage);
        setStageChangeDialogOpen(true);
    };

    const confirmStageChange = () => {
        if (!targetStage) return;
        startTransition(async () => {
            const result = await changeGoalStageAction(circle.handle!, goal._id as string, targetStage);
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update goal stage",
                    variant: "destructive",
                });
            }
            setStageChangeDialogOpen(false);
            setTargetStage(null);
        });
    };

    const { color: stageColor, icon: StageIcon, text: stageText } = getGoalStageInfo(goal.stage);

    // Determine available stage transitions based on current stage and permissions
    const availableStageActions: {
        label: string;
        stage: GoalStage;
        allowed: boolean;
    }[] = [
        {
            label: "Approve (Open)",
            stage: "open" as GoalStage,
            allowed: permissions.canReview && goal.stage === "review",
        },
        {
            label: "Mark Resolved",
            stage: "resolved" as GoalStage,
            allowed: permissions.canResolve && goal.stage === "open",
        },
        {
            label: "Re-open",
            stage: "open" as GoalStage,
            allowed: permissions.canResolve && goal.stage === "resolved",
        },
    ].filter((action) => action.allowed);

    const canEditGoal = (isAuthor && goal.stage === "review") || permissions.canModerate;
    const canDeleteGoal = isAuthor || permissions.canModerate;

    const handleFollowToggle = () => {
        if (!goal._id || !circle.handle) return;
        setIsLoadingFollow(true);
        startTransition(async () => {
            const actionToCall = isFollowingCurrentUser ? unfollowGoalAction : followGoalAction;
            const currentFollowStatus = isFollowingCurrentUser;
            const currentFollowerCount = followersCount;

            // Optimistic update
            setIsFollowingCurrentUser(!currentFollowStatus);
            setFollowersCount(currentFollowerCount + (!currentFollowStatus ? 1 : -1));

            try {
                const result = await actionToCall(circle.handle!, goal._id as string);
                if (result.success) {
                    toast({
                        title: "Success",
                        description: result.message,
                    });
                    // Actual state update based on server response (could refine optimistic update if server returns new count)
                    // For now, the optimistic update stands unless an error occurs.
                    // router.refresh(); // Could cause a full re-render, might not be needed if only count/status changes
                } else {
                    toast({
                        title: "Error",
                        description: result.message || "Action failed",
                        variant: "destructive",
                    });
                    // Revert optimistic update on failure
                    setIsFollowingCurrentUser(currentFollowStatus);
                    setFollowersCount(currentFollowerCount);
                }
            } catch (error) {
                toast({
                    title: "Error",
                    description: "An unexpected error occurred.",
                    variant: "destructive",
                });
                // Revert optimistic update on failure
                setIsFollowingCurrentUser(currentFollowStatus);
                setFollowersCount(currentFollowerCount);
            } finally {
                setIsLoadingFollow(false);
            }
        });
    };

    // Function to render primary action buttons based on stage and permissions
    const renderGoalActions = () => {
        const actions = [];
        if (permissions.canReview && goal.stage === "review") {
            actions.push(
                <Button key="approve" onClick={() => openStageChangeDialog("open")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Approve (Open)
                </Button>,
            );
        }
        if (permissions.canResolve && goal.stage === "open") {
            actions.push(
                <Button key="resolve" onClick={() => openStageChangeDialog("resolved")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Mark Resolved
                </Button>,
            );
        }
        if (permissions.canResolve && goal.stage === "resolved") {
            actions.push(
                <Button
                    key="reopen"
                    variant="outline"
                    onClick={() => openStageChangeDialog("open")}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Re-open Goal
                </Button>,
            );
        }
        if (actions.length === 0) return null;
        return <div className="flex flex-wrap items-center gap-2">{actions}</div>;
    };

    // Define the main content structure
    const mainContent = (
        <>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                    <div className="mb-2 flex items-center space-x-2">
                        {isPreview ? (
                            <h1>{goal.title}</h1>
                        ) : (
                            <Link
                                href={`/circles/${circle.handle}/goals/${goal._id}`}
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                                <h1>{goal.title}</h1>
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
                            Created by {goal.author.name}{" "}
                            {goal.createdAt &&
                                formatDistanceToNow(new Date(goal.createdAt), {
                                    addSuffix: true,
                                })}
                        </div>
                        {goal.location && (
                            <div className="flex items-center">
                                <MapPin className="mr-1 h-3 w-3" />
                                {getFullLocationName(goal.location)}
                            </div>
                        )}
                        {goal.targetDate && (
                            <div className="flex items-center">
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                Target: {format(new Date(goal.targetDate), "PPP")}
                            </div>
                        )}
                        {linkedProposal && (
                            <div className="flex items-center">
                                <LinkIcon className="mr-1 h-3 w-3" />
                                From Proposal:{" "}
                                <Link
                                    href={`/circles/${circle.handle}/proposals/${linkedProposal._id}`}
                                    className="ml-1 text-blue-600 hover:underline"
                                >
                                    {linkedProposal.name}
                                </Link>
                            </div>
                        )}
                        {isLoadingProposal && !linkedProposal && (
                            <div className="flex items-center text-xs text-muted-foreground">
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading proposal link...
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions Dropdown */}
                <div className="flex items-center gap-2">
                    {/* Follow Button */}
                    {canFollowFeatureEnabled && !isLoadingInitialFollowStatus && (
                        <Button
                            variant={isFollowingCurrentUser ? "outline" : "default"}
                            size="sm"
                            onClick={handleFollowToggle}
                            disabled={isLoadingFollow || isPending}
                            className="flex items-center"
                        >
                            {isLoadingFollow ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : isFollowingCurrentUser ? (
                                <UserCheck className="mr-2 h-4 w-4" />
                            ) : (
                                <UserPlus className="mr-2 h-4 w-4" />
                            )}
                            {isFollowingCurrentUser ? "Following" : "Follow"}
                            {followersCount > 0 && <span className="ml-2 text-xs">({followersCount})</span>}
                        </Button>
                    )}
                    {isLoadingInitialFollowStatus && canFollowFeatureEnabled && (
                        <Button variant="outline" size="sm" disabled className="flex items-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                        </Button>
                    )}

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Options</DropdownMenuLabel>
                            {canEditGoal && (
                                <DropdownMenuItem onClick={handleEdit} disabled={goal.stage === "resolved"}>
                                    <Pencil className="mr-2 h-4 w-4" /> Edit Goal
                                </DropdownMenuItem>
                            )}
                            {canDeleteGoal && (
                                <>
                                    {canEditGoal && <DropdownMenuSeparator />}
                                    <DropdownMenuItem
                                        onClick={() => setDeleteDialogOpen(true)}
                                        className="text-red-600"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Goal
                                    </DropdownMenuItem>
                                </>
                            )}
                            {/* Separator if other actions exist and follow actions are added here */}
                            {/* Example: Add follow/unfollow to dropdown too if needed */}
                            {/* {canFollowFeatureEnabled && (canEditGoal || canDeleteGoal) && <DropdownMenuSeparator />} */}
                            {/* {canFollowFeatureEnabled && (
                                <DropdownMenuItem onClick={handleFollowToggle} disabled={isLoadingFollow || isPending}>
                                    {isFollowingCurrentUser ? (
                                        <UserCheck className="mr-2 h-4 w-4" />
                                    ) : (
                                        <UserPlus className="mr-2 h-4 w-4" />
                                    )}
                                    {isFollowingCurrentUser ? "Unfollow Goal" : "Follow Goal"}
                                </DropdownMenuItem>
                            )} */}
                            {!canEditGoal && !canDeleteGoal && !canFollowFeatureEnabled && (
                                <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>

            <CardContent className="pt-4">
                {/* Description */}
                <div className="mb-6">
                    <h3 className="mb-2 text-lg font-semibold">Description</h3>
                    <div className="prose max-w-none">
                        <RichText content={goal.description} />
                    </div>
                </div>

                {/* Images */}
                {goal.images && goal.images.length > 0 && (
                    <div className="mb-6">
                        <h3 className="mb-2 text-lg font-semibold">Images</h3>
                        <ImageThumbnailCarousel images={goal.images} className="w-full" />
                    </div>
                )}

                {/* Action Buttons Section */}
                {renderGoalActions() && (
                    <div className="mt-6 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Actions</h3>
                        {renderGoalActions()}
                    </div>
                )}

                {/* Associated Tasks Section - Use props */}
                {tasksModuleEnabled && canViewTasks && (
                    <div className="mt-8 border-t pt-6">
                        <h3 className="flex items-center text-lg font-semibold">
                            <ListChecks className="mr-2 h-5 w-5" />
                            Associated Tasks
                            {/* ({activeTasks.length} active / {linkedTasks.length} total) */}
                        </h3>
                        <TasksList
                            // Construct the tasksData prop using active tasks
                            tasksData={{
                                tasks: activeTasks,
                                // Provide default/dummy ranking info
                                hasUserRanked: false,
                                totalRankers: 0,
                                unrankedCount: 0,
                                userRankBecameStaleAt: null,
                            }}
                            circle={circle}
                            permissions={taskPermissions!} // Pass task permissions prop
                            hideRank={true}
                        />
                    </div>
                )}

                {/* --- Comment Section --- */}
                {goal.commentPostId && permissions.canComment && (
                    <CommentSection
                        postId={goal.commentPostId}
                        circle={circle}
                        user={user ?? null} // Convert undefined from atom to null for the component prop
                        // initialCommentCount={goal.comments || 0} // Pass if comment count is added to GoalDisplay
                    />
                )}
                {/* Show message if comments are disabled or no post ID */}
                {(!goal.commentPostId || !permissions.canComment) && (
                    <div className="mt-8 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Comments</h3>
                        <div className="text-sm text-gray-500">
                            {permissions.canComment
                                ? "Comments are not available for this goal yet."
                                : "Comments are disabled or you don't have permission."}
                        </div>
                    </div>
                )}
                {/* --- End Comment Section --- */}
            </CardContent>
        </>
    );

    return (
        <TooltipProvider>
            {isPreview ? <div className="p-4">{mainContent}</div> : <Card className="mb-6">{mainContent}</Card>}

            {/* Dialogs remain outside */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Delete Goal</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this goal? This action cannot be undone.
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
                            Are you sure you want to move this goal to the &quot;
                            {targetStage}&quot; stage?
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
        </TooltipProvider>
    );
};

export default GoalDetail;

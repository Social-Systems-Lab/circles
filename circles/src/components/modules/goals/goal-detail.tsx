"use client";

import React, { useState, useTransition, useEffect, useMemo } from "react"; // Added useMemo
import {
    Circle,
    GoalDisplay,
    GoalStage,
    MemberDisplay,
    GoalPermissions,
    TaskDisplay,
    TaskPermissions,
} from "@/models/models"; // Added TaskDisplay, TaskPermissions
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
    Edit,
    CalendarIcon,
} from "lucide-react"; // Added CalendarIcon
import { formatDistanceToNow, format } from "date-fns";
import { UserPicture } from "../members/user-picture";
import { cn, getFullLocationName } from "@/lib/utils";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
// Import auth and constants for permission checks
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
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import RichText from "../feeds/RichText";
import ImageThumbnailCarousel from "@/components/ui/image-thumbnail-carousel";
import {
    changeGoalStageAction, // Renamed action
    deleteGoalAction, // Renamed action
    getMembersAction, // Keep this action (assuming it's generic)
} from "@/app/circles/[handle]/goals/actions"; // Updated path
// Import the correct task action to get all tasks
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
// Import Task List component
import TasksList from "@/components/modules/tasks/tasks-list"; // Assuming this path
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

// Helper function for stage badge styling and icons (copied from goals-list)
const getStageInfo = (stage: GoalStage) => {
    // Updated type
    switch (stage) {
        case "review":
            return { color: "bg-yellow-200 text-yellow-800", icon: Clock, text: "Review" };
        case "open":
            return { color: "bg-blue-200 text-blue-800", icon: Play, text: "Open" };
        // Removed "inProgress" case
        case "resolved":
            return { color: "bg-green-200 text-green-800", icon: CheckCircle, text: "Resolved" };
        default:
            return { color: "bg-gray-200 text-gray-800", icon: Clock, text: "Unknown" };
    }
};

// Permissions type is imported from models

interface GoalDetailProps {
    // Renamed interface
    goal: GoalDisplay; // Renamed prop, updated type
    circle: Circle;
    permissions: GoalPermissions; // Updated type
    currentUserDid: string;
    isPreview?: boolean;
}

const GoalDetail: React.FC<GoalDetailProps> = ({ goal, circle, permissions, currentUserDid, isPreview = false }) => {
    // Renamed component, props
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [stageChangeDialogOpen, setStageChangeDialogOpen] = useState(false);
    const [targetStage, setTargetStage] = useState<GoalStage | null>(null);
    const [members, setMembers] = useState<MemberDisplay[]>([]);
    const [associatedTasks, setAssociatedTasks] = useState<TaskDisplay[]>([]); // State for tasks
    const [isLoadingTasks, setIsLoadingTasks] = useState(false); // Loading state for tasks
    const [canViewTasks, setCanViewTasks] = useState(false); // Permission state
    const [taskPermissions, setTaskPermissions] = useState<TaskPermissions | null>(null); // Full task permissions
    const { toast } = useToast();
    const router = useRouter();

    const isAuthor = currentUserDid === goal.createdBy;

    // Check if tasks module is enabled
    const tasksModuleEnabled = useMemo(() => circle.enabledModules?.includes("tasks"), [circle.enabledModules]);

    // Fetch associated tasks and check permissions
    useEffect(() => {
        const fetchTasksAndPermissions = async () => {
            if (!tasksModuleEnabled || !user?.did) {
                setCanViewTasks(false);
                return;
            }

            setIsLoadingTasks(true);
            try {
                // Check view permission first
                const hasViewPermission = await isAuthorized(user.did, circle._id!, features.tasks.view);
                setCanViewTasks(hasViewPermission);

                if (hasViewPermission) {
                    // Fetch ALL tasks for the circle
                    const allTasksResult = await getTasksAction(circle.handle!);
                    // Filter tasks associated with this goal client-side
                    const goalTasks = allTasksResult.tasks.filter((task) => task.goalId === goal._id);
                    setAssociatedTasks(goalTasks);

                    // Fetch detailed task permissions (needed for TasksList actions)
                    const canModerateTasks = await isAuthorized(user.did, circle._id!, features.tasks.moderate);
                    const canReviewTasks = await isAuthorized(user.did, circle._id!, features.tasks.review);
                    const canAssignTasks = await isAuthorized(user.did, circle._id!, features.tasks.assign);
                    const canResolveTasks = await isAuthorized(user.did, circle._id!, features.tasks.resolve);
                    const canCommentTasks = await isAuthorized(user.did, circle._id!, features.tasks.comment); // Assuming comment feature exists
                    setTaskPermissions({
                        canModerate: canModerateTasks,
                        canReview: canReviewTasks,
                        canAssign: canAssignTasks,
                        canResolve: canResolveTasks,
                        canComment: canCommentTasks,
                    });
                } else {
                    setAssociatedTasks([]);
                    setTaskPermissions(null);
                }
            } catch (error) {
                console.error("Error fetching tasks or permissions:", error);
                setCanViewTasks(false);
                setAssociatedTasks([]);
                setTaskPermissions(null);
                // Optionally show toast error
            } finally {
                setIsLoadingTasks(false);
            }
        };

        fetchTasksAndPermissions();
    }, [tasksModuleEnabled, user?.did, circle.handle, circle._id, goal._id]);

    // Filter for active tasks
    const activeTasks = useMemo(() => {
        return associatedTasks.filter((task) => task.stage === "open" || task.stage === "inProgress");
    }, [associatedTasks]);

    const handleEdit = () => {
        router.push(`/circles/${circle.handle}/goals/${goal._id}/edit`); // Updated path
    };

    const handleDelete = async () => {
        startTransition(async () => {
            const result = await deleteGoalAction(circle.handle!, goal._id as string); // Renamed action, use goal prop
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.push(`/circles/${circle.handle}/goals`); // Updated path, Redirect after delete
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete goal", // Updated message
                    variant: "destructive",
                });
            }
            setDeleteDialogOpen(false);
        });
    };

    const openStageChangeDialog = (stage: GoalStage) => {
        // Updated type
        setTargetStage(stage);
        setStageChangeDialogOpen(true);
    };

    const confirmStageChange = () => {
        if (!targetStage) return;
        startTransition(async () => {
            const result = await changeGoalStageAction(circle.handle!, goal._id as string, targetStage); // Renamed action, use goal prop
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh to show the new stage
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update goal stage", // Updated message
                    variant: "destructive",
                });
            }
            setStageChangeDialogOpen(false);
            setTargetStage(null);
        });
    };

    const { color: stageColor, icon: StageIcon, text: stageText } = getStageInfo(goal.stage); // Use goal prop

    // Determine available stage transitions based on current stage and permissions
    const availableStageActions: { label: string; stage: GoalStage; allowed: boolean }[] = [
        // Updated type
        {
            label: "Approve (Open)",
            stage: "open" as GoalStage, // Updated type
            allowed: permissions.canReview && goal.stage === "review",
        },
        // Removed "Start Progress" action
        {
            label: "Mark Resolved",
            stage: "resolved" as GoalStage,
            allowed: permissions.canResolve && goal.stage === "open", // Now allowed from "open"
        },
        {
            label: "Re-open",
            stage: "open" as GoalStage,
            allowed: permissions.canResolve && goal.stage === "resolved", // Only allowed from "resolved" now
        },
    ].filter((action) => action.allowed);

    const canEditGoal = (isAuthor && goal.stage === "review") || permissions.canModerate; // Renamed variable, use goal prop
    const canDeleteGoal = isAuthor || permissions.canModerate; // Renamed variable

    // Function to render primary action buttons based on stage and permissions
    const renderGoalActions = () => {
        // Renamed function
        const actions = [];

        // Stage change actions
        if (permissions.canReview && goal.stage === "review") {
            // Use goal prop
            actions.push(
                <Button key="approve" onClick={() => openStageChangeDialog("open")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Approve (Open)
                </Button>,
            );
        }
        // Removed "Start Progress" button logic
        if (permissions.canResolve && goal.stage === "open") {
            // Changed condition from "inProgress" to "open"
            actions.push(
                <Button key="resolve" onClick={() => openStageChangeDialog("resolved")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Mark Resolved
                </Button>,
            );
        }
        if (permissions.canResolve && goal.stage === "resolved") {
            // Changed condition to only check "resolved"
            actions.push(
                <Button
                    key="reopen"
                    variant="outline"
                    onClick={() => openStageChangeDialog("open")}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Re-open Goal{" "}
                    {/* Updated text */}
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
                            <h1>{goal.title}</h1> // Use goal prop
                        ) : (
                            <Link
                                href={`/circles/${circle.handle}/goals/${goal._id}`} // Updated path
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                                <h1>{goal.title}</h1> {/* Use goal prop */}
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
                            Created by {goal.author.name} {/* Use goal prop */}
                            {goal.createdAt && formatDistanceToNow(new Date(goal.createdAt), { addSuffix: true })}{" "}
                            {/* Use goal prop */}
                        </div>
                        {goal.location && ( // Use goal prop
                            <div className="flex items-center">
                                <MapPin className="mr-1 h-3 w-3" />
                                {getFullLocationName(goal.location)} {/* Use goal prop */}
                            </div>
                        )}
                        {goal.targetDate && ( // Added Target Date display
                            <div className="flex items-center">
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                Target: {format(new Date(goal.targetDate), "PPP")}
                            </div>
                        )}
                    </div>
                </div>

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
                        {/* Edit Action */}
                        {canEditGoal && ( // Renamed variable
                            <DropdownMenuItem onClick={handleEdit} disabled={goal.stage === "resolved"}>
                                {" "}
                                {/* Use goal prop */}
                                <Pencil className="mr-2 h-4 w-4" /> Edit Goal {/* Updated text */}
                            </DropdownMenuItem>
                        )}
                        {/* Delete Action */}
                        {canDeleteGoal && ( // Renamed variable
                            <>
                                {canEditGoal && <DropdownMenuSeparator />} {/* Renamed variable */}
                                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Goal {/* Updated text */}
                                </DropdownMenuItem>
                            </>
                        )}
                        {/* Show message if no actions */}
                        {!canEditGoal &&
                            !canDeleteGoal && ( // Renamed variables
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
                        <RichText content={goal.description} /> {/* Use goal prop */}
                    </div>
                </div>

                {/* Images */}
                {goal.images &&
                    goal.images.length > 0 && ( // Use goal prop
                        <div className="mb-6">
                            <h3 className="mb-2 text-lg font-semibold">Images</h3>
                            <ImageThumbnailCarousel images={goal.images} className="w-full" /> {/* Use goal prop */}
                        </div>
                    )}

                {/* Action Buttons Section */}
                {renderGoalActions() && ( // Renamed function
                    <div className="mt-6 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Actions</h3>
                        {renderGoalActions()} {/* Renamed function */}
                    </div>
                )}

                {/* Associated Tasks Section */}
                {tasksModuleEnabled && canViewTasks && (
                    <div className="mt-8 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Associated Tasks</h3>
                        {isLoadingTasks ? (
                            <div className="flex justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : activeTasks.length > 0 && taskPermissions ? (
                            <TasksList
                                // Construct the tasksData prop
                                tasksData={{
                                    tasks: activeTasks,
                                    // Provide default/dummy ranking info as it's not the focus here
                                    hasUserRanked: false,
                                    totalRankers: 0,
                                    unrankedCount: 0,
                                    userRankBecameStaleAt: null,
                                }}
                                circle={circle}
                                permissions={taskPermissions} // Pass fetched task permissions
                                // Removed currentUserDid and layout props
                            />
                        ) : (
                            <div className="text-center text-gray-500">No active tasks associated with this goal.</div>
                        )}
                    </div>
                )}

                {/* Comments Section Placeholder */}
                <div className="mt-8 border-t pt-6">
                    <h3 className="mb-4 text-lg font-semibold">Comments</h3>
                    {/* TODO: Integrate comment component here */}
                    <div className="text-center text-gray-500">
                        {permissions.canComment
                            ? "Comment functionality coming soon."
                            : "Comments are disabled or you don't have permission."}
                    </div>
                </div>
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Goal</DialogTitle> {/* Updated text */}
                        <DialogDescription>
                            Are you sure you want to delete this goal? This action cannot be undone.{" "}
                            {/* Updated text */}
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Stage Change</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to move this goal to the &quot;{targetStage}&quot; stage?{" "}
                            {/* Updated text & fixed quotes */}
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

export default GoalDetail; // Renamed export

// task-detail.tsx
"use client";

import React, { useState, useTransition, useEffect } from "react";
import { Circle, TaskDisplay, TaskStage, MemberDisplay, TaskPermissions, TaskPriority } from "@/models/models"; // Updated types
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import {
    ChevronDown,
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
    Target,
} from "lucide-react"; // Added Target icon
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
import RichText from "../feeds/RichText";
import ImageThumbnailCarousel from "@/components/ui/image-thumbnail-carousel";
import {
    changeTaskStageAction, // Renamed action
    assignTaskAction, // Renamed action
    deleteTaskAction, // Renamed action
    getMembersAction, // Keep this action (assuming it's generic)
    updateTaskPriorityAction,
} from "@/app/circles/[handle]/tasks/actions"; // Updated path
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { CommentSection } from "../feeds/CommentSection"; // Import CommentSection

// Helper function for stage badge styling and icons (copied from tasks-list)
const getStageInfo = (stage: TaskStage) => {
    // Updated type
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

const taskPriorityOptions: { value: TaskPriority | "none"; label: string }[] = [
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "none", label: "No Priority" },
];

const getPriorityInfo = (priority?: TaskPriority) => {
    switch (priority) {
        case "low":
            return { label: "Low", badgeClassName: "border-transparent bg-green-100 text-green-800" };
        case "medium":
            return { label: "Medium", badgeClassName: "border-transparent bg-blue-100 text-blue-800" };
        case "high":
            return { label: "High", badgeClassName: "border-transparent bg-orange-100 text-orange-800" };
        case "critical":
            return { label: "Critical", badgeClassName: "border-transparent bg-red-100 text-red-800" };
        default:
            return { label: "No Priority", badgeClassName: "border-transparent bg-slate-100 text-slate-700" };
    }
};

// Permissions type is imported from models

interface TaskDetailProps {
    // Renamed interface
    task: TaskDisplay; // Renamed prop, updated type
    circle: Circle;
    permissions: TaskPermissions; // Updated type
    currentUserDid: string;
    isPreview?: boolean;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ task, circle, permissions, currentUserDid, isPreview = false }) => {
    // Renamed component, props
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [stageChangeDialogOpen, setStageChangeDialogOpen] = useState(false);
    const [targetStage, setTargetStage] = useState<TaskStage | null>(null); // Updated type
    const [selectedStage, setSelectedStage] = useState<TaskStage>(task.stage);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [members, setMembers] = useState<MemberDisplay[]>([]);
    const [selectedAssigneeDid, setSelectedAssigneeDid] = useState<string | undefined>(task.assignedTo); // Use task prop
    const [selectedPriority, setSelectedPriority] = useState<TaskPriority | "none">(task.priority ?? "none");
    const { toast } = useToast();
    const router = useRouter();

    const isAuthor = currentUserDid === task.createdBy; // Use task prop
    const isAssignee = currentUserDid === task.assignedTo; // Use task prop

    useEffect(() => {
        setSelectedPriority(task.priority ?? "none");
    }, [task._id, task.priority]);

    useEffect(() => {
        setSelectedStage(task.stage);
    }, [task._id, task.stage]);

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
        router.push(`/circles/${circle.handle}/tasks/${task._id}/edit`); // Updated path
    };

    const handleDelete = async () => {
        startTransition(async () => {
            const result = await deleteTaskAction(circle.handle!, task._id as string); // Renamed action, use task prop
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.push(`/circles/${circle.handle}/tasks`); // Updated path, Redirect after delete
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete task", // Updated message
                    variant: "destructive",
                });
            }
            setDeleteDialogOpen(false);
        });
    };

    const openStageChangeDialog = (stage: TaskStage) => {
        // Updated type
        setTargetStage(stage);
        setStageChangeDialogOpen(true);
    };

    const confirmStageChange = () => {
        if (!targetStage) return;
        const previousStage = selectedStage;
        setSelectedStage(targetStage);
        startTransition(async () => {
            const result = await changeTaskStageAction(circle.handle!, task._id as string, targetStage); // Renamed action, use task prop
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh to show the new stage
            } else {
                setSelectedStage(previousStage);
                toast({
                    title: "Error",
                    description: result.message || "Failed to update task stage", // Updated message
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

            const result = await assignTaskAction(circle.handle!, task._id as string, formData); // Renamed action, use task prop
            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh to show new assignee
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to assign task", // Updated message
                    variant: "destructive",
                });
            }
            setAssignDialogOpen(false);
        });
    };

    const currentStage = selectedStage;
    const { color: stageColor, icon: StageIcon, text: stageText } = getStageInfo(currentStage);
    const priorityInfo = getPriorityInfo(selectedPriority === "none" ? undefined : selectedPriority);

    // Determine available stage transitions based on current stage and permissions
    const availableStageActions: { label: string; stage: TaskStage; allowed: boolean }[] = [
        // Updated type
        {
            label: "Approve (Open)",
            stage: "open" as TaskStage, // Updated type
            allowed: permissions.canReview && currentStage === "review",
        },
        {
            label: "Start Progress",
            stage: "inProgress" as TaskStage, // Updated type
            allowed: (permissions.canResolve || isAssignee) && currentStage === "open",
        },
        {
            label: "Mark Resolved",
            stage: "resolved" as TaskStage, // Updated type
            allowed: (permissions.canResolve || isAssignee) && currentStage === "inProgress",
        },
        {
            label: "Re-open",
            stage: "open" as TaskStage, // Updated type
            allowed: permissions.canResolve && (currentStage === "resolved" || currentStage === "inProgress"),
        }, // Allow re-opening
    ].filter((action) => action.allowed);

    const canEditTask = (isAuthor && currentStage === "review") || permissions.canModerate;
    const canDeleteTask = isAuthor || permissions.canModerate; // Renamed variable

    const handlePriorityChange = (value: TaskPriority | "none") => {
        const previousPriority = selectedPriority;
        setSelectedPriority(value);

        startTransition(async () => {
            const result = await updateTaskPriorityAction(
                circle.handle!,
                task._id as string,
                value === "none" ? "" : value,
            );

            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh();
                return;
            }

            setSelectedPriority(previousPriority);
            toast({
                title: "Error",
                description: result.message || "Failed to update task priority",
                variant: "destructive",
            });
        });
    };

    // Function to render primary action buttons based on stage and permissions
    const renderTaskActions = () => {
        // Renamed function
        const actions = [];

        // Stage change actions
        if (permissions.canReview && currentStage === "review") {
            actions.push(
                <Button key="approve" onClick={() => openStageChangeDialog("open")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Approve (Open)
                </Button>,
            );
        }
        if (currentStage === "open" && isAssignee) {
            actions.push(
                <Button key="accept" onClick={() => openStageChangeDialog("inProgress")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Accept Task
                </Button>,
            );
        }
        if (permissions.canResolve && currentStage === "open" && !isAssignee) {
            actions.push(
                <Button key="start" onClick={() => openStageChangeDialog("inProgress")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Start Progress
                </Button>,
            );
        }
        if (currentStage === "inProgress" && isAssignee) {
            actions.push(
                <Button key="complete" onClick={() => openStageChangeDialog("resolved")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Mark Complete
                </Button>,
            );
        }
        if (permissions.canResolve && currentStage === "inProgress" && !isAssignee) {
            actions.push(
                <Button key="resolve" onClick={() => openStageChangeDialog("resolved")} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Mark Resolved
                </Button>,
            );
        }
        if (permissions.canResolve && (currentStage === "resolved" || currentStage === "inProgress")) {
            actions.push(
                <Button
                    key="reopen"
                    variant="outline"
                    onClick={() => openStageChangeDialog("open")}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Re-open Task{" "}
                    {/* Updated text */}
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
                    {task.assignee ? ( // Use task prop
                        <>
                            Assigned to:
                            <UserPicture
                                name={task.assignee.name}
                                picture={task.assignee.picture?.url}
                                size="20px"
                            />{" "}
                            {/* Use task prop */}
                            {task.assignee.name} {/* Use task prop */}
                        </>
                    ) : (
                        "Assign Task" // Updated text
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
            <CardHeader className="space-y-0 pb-2">
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge className={`${stageColor} shrink-0 items-center gap-1`}>
                                <StageIcon className="h-3 w-3" />
                                {stageText}
                            </Badge>
                            {canEditTask ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={isPending}
                                            className={cn(
                                                "h-6 max-w-full gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-none",
                                                priorityInfo.badgeClassName,
                                            )}
                                        >
                                            <span className="truncate">{priorityInfo.label}</span>
                                            <ChevronDown className="h-3 w-3 shrink-0" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-[180px]">
                                        <DropdownMenuLabel>Priority</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuRadioGroup
                                            value={selectedPriority}
                                            onValueChange={(value) =>
                                                handlePriorityChange(value as TaskPriority | "none")
                                            }
                                        >
                                            {taskPriorityOptions.map((option) => (
                                                <DropdownMenuRadioItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <Badge
                                    variant="outline"
                                    className={cn("shrink-0 border", priorityInfo.badgeClassName)}
                                >
                                    {priorityInfo.label}
                                </Badge>
                            )}
                        </div>

                        {/* Actions Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 shrink-0 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Options</DropdownMenuLabel>
                                {/* Edit Action */}
                                {canEditTask && ( // Renamed variable
                                    <DropdownMenuItem onClick={handleEdit} disabled={currentStage === "resolved"}>
                                        <Pencil className="mr-2 h-4 w-4" /> Edit Task {/* Updated text */}
                                    </DropdownMenuItem>
                                )}
                                {/* Delete Action */}
                                {canDeleteTask && ( // Renamed variable
                                    <>
                                        {canEditTask && <DropdownMenuSeparator />} {/* Renamed variable */}
                                        <DropdownMenuItem
                                            onClick={() => setDeleteDialogOpen(true)}
                                            className="text-red-600"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete Task {/* Updated text */}
                                        </DropdownMenuItem>
                                    </>
                                )}
                                {/* Show message if no actions */}
                                {!canEditTask &&
                                    !canDeleteTask && ( // Renamed variables
                                        <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
                                    )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Link only if not in preview */}
                    {isPreview ? (
                        <h1 className="min-w-0 break-words [overflow-wrap:anywhere]">{task.title}</h1>
                    ) : (
                        <Link
                            href={`/circles/${circle.handle}/tasks/${task._id}`} // Updated path
                            className="min-w-0"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                            <h1 className="min-w-0 break-words [overflow-wrap:anywhere]">{task.title}</h1>
                        </Link>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center">
                            <User className="mr-1 h-3 w-3" />
                            Created by {task.author.name} {/* Use task prop */}
                            {task.createdAt && formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}{" "}
                            {/* Use task prop */}
                        </div>
                        {task.assignee && ( // Use task prop
                            <div className="flex items-center">
                                <User className="mr-1 h-3 w-3 text-blue-600" />
                                Assigned to {task.assignee.name} {/* Use task prop */}
                            </div>
                        )}
                        {task.location && ( // Use task prop
                            <div className="flex items-center">
                                <MapPin className="mr-1 h-3 w-3" />
                                {getFullLocationName(task.location)} {/* Use task prop */}
                            </div>
                        )}
                        {/* Display Linked Goal */}
                        {circle.enabledModules?.includes("goals") && task.goal && (
                            <div className="flex items-center">
                                <Target className="mr-1 h-3 w-3 text-purple-600" /> {/* Added Goal Icon */}
                                <Link
                                    href={`/circles/${circle.handle}/goals/${task.goal._id}`}
                                    className="hover:underline"
                                    onClick={(e: React.MouseEvent) => e.stopPropagation()} // Prevent card click if nested
                                >
                                    Goal: {task.goal.title}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-4">
                {/* Description */}
                <div className="mb-6">
                    <h3 className="mb-2 text-lg font-semibold">Description</h3>
                    <div className="prose max-w-none">
                        <RichText content={task.description} /> {/* Use task prop */}
                    </div>
                </div>

                {/* Images */}
                {task.images &&
                    task.images.length > 0 && ( // Use task prop
                        <div className="mb-6">
                            <h3 className="mb-2 text-lg font-semibold">Images</h3>
                            <ImageThumbnailCarousel images={task.images} className="w-full" /> {/* Use task prop */}
                        </div>
                    )}

                {/* Action Buttons Section */}
                {renderTaskActions() && ( // Renamed function
                    <div className="mt-6 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Actions</h3>
                        {renderTaskActions()} {/* Renamed function */}
                    </div>
                )}

                {/* --- Comment Section --- */}
                {task.commentPostId && permissions.canComment && (
                    <CommentSection
                        postId={task.commentPostId}
                        circle={circle}
                        user={user ?? null} // Convert undefined from atom to null
                        // initialCommentCount={task.comments || 0} // Pass if comment count is added to TaskDisplay
                    />
                )}
                {/* Show message if comments are disabled or no post ID */}
                {(!task.commentPostId || !permissions.canComment) && (
                    <div className="mt-8 border-t pt-6">
                        <h3 className="mb-4 text-lg font-semibold">Comments</h3>
                        <div className="text-sm text-gray-500">
                            {permissions.canComment
                                ? "Comments are not available for this task yet."
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
                        <DialogTitle>Delete Task</DialogTitle> {/* Updated text */}
                        <DialogDescription>
                            Are you sure you want to delete this task? This action cannot be undone.{" "}
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
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Confirm Stage Change</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to move this task to the &quot;{targetStage}&quot; stage?{" "}
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

            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Assign Task</DialogTitle> {/* Updated text */}
                        <DialogDescription>
                            Select a member to assign this task to, or assign it to yourself. {/* Updated text */}
                        </DialogDescription>
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

export default TaskDetail; // Renamed export

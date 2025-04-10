"use client";

import React, { useEffect, useState, useTransition, ChangeEvent } from "react";
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Circle, ContentPreviewData, TaskDisplay, TaskStage, TaskPermissions } from "@/models/models"; // Use Task types, Added ContentPreviewData, TaskPermissions
import { Button } from "@/components/ui/button";
import {
    ArrowDown,
    ArrowUp,
    Loader2,
    MoreHorizontal,
    Plus,
    CheckCircle,
    XCircle,
    Clock,
    Play,
    User,
} from "lucide-react"; // Added icons
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { deleteTaskAction } from "@/app/circles/[handle]/tasks/actions"; // Use task delete action
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants"; // Added constants import
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useAtom } from "jotai";
import { userAtom, contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Permissions type is imported from models

interface TasksListProps {
    // Renamed interface
    tasks: TaskDisplay[]; // Renamed prop, updated type
    circle: Circle;
    permissions: TaskPermissions; // Use imported type
}

const SortIcon = ({ sortDir }: { sortDir: string | boolean }) => {
    if (!sortDir) return null;
    return sortDir === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
};

const tableRowVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.05,
            duration: 0.3,
        },
    }),
};

// Helper function for stage badge styling and icons
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

const TasksList: React.FC<TasksListProps> = ({ tasks, circle, permissions }) => {
    // Renamed component, props
    const data = React.useMemo(() => tasks, [tasks]); // Renamed variable, dependency
    const [user] = useAtom(userAtom);
    const [sorting, setSorting] = React.useState<SortingState>([{ id: "createdAt", desc: true }]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState<boolean>(false); // Renamed state
    const [selectedTask, setSelectedTask] = useState<TaskDisplay | null>(null); // Renamed state, updated type
    const [isPending, startTransition] = useTransition();
    const isCompact = useIsCompact();
    const router = useRouter();
    const { toast } = useToast();
    const [stageFilter, setStageFilter] = useState<TaskStage | "all">("all"); // Updated type
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    // Add assignee filter state if needed later
    // const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

    const columns = React.useMemo<ColumnDef<TaskDisplay>[]>( // Updated type
        () => [
            {
                accessorKey: "title",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Title
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const task = info.row.original; // Renamed variable
                    return (
                        <Link
                            href={`/circles/${circle.handle}/tasks/${task._id}`} // Updated path
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-blue-600 hover:underline"
                        >
                            {info.getValue() as string}
                        </Link>
                    );
                },
            },
            {
                accessorKey: "stage",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Stage
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const stage = info.getValue() as TaskStage; // Updated type
                    const { color, icon: Icon, text } = getStageInfo(stage);
                    return (
                        <Badge className={`${color} items-center gap-1`}>
                            <Icon className="h-3 w-3" />
                            {text}
                        </Badge>
                    );
                },
                filterFn: (row, id, value) => row.getValue(id) === value,
            },
            {
                accessorKey: "assignee",
                header: "Assigned To",
                cell: (info) => {
                    const assignee = info.getValue() as Circle | undefined;
                    if (!assignee) {
                        return <span className="text-gray-500">Unassigned</span>;
                    }
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="flex cursor-pointer items-center gap-2"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Keep stopPropagation
                                            openAssignee(assignee); // Call the correct handler
                                        }}
                                    >
                                        <UserPicture name={assignee.name} picture={assignee.picture?.url} size="32px" />
                                        {!isCompact && <span>{assignee.name}</span>}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>{assignee.name}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                },
            },
            {
                accessorKey: "author", // Assuming 'author' is populated in TaskDisplay
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Created By
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const author = info.getValue() as Circle;
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="flex cursor-pointer items-center gap-2"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Keep stopPropagation
                                            openAuthor(author); // Call the correct handler
                                        }}
                                    >
                                        <UserPicture name={author.name} picture={author.picture?.url} size="32px" />
                                        {!isCompact && <span>{author.name}</span>}
                                    </div>
                                </TooltipTrigger>
                                {isCompact && <TooltipContent>{author.name}</TooltipContent>}
                            </Tooltip>
                        </TooltipProvider>
                    );
                },
                enableSorting: false, // Sorting by author object might be complex
            },
            {
                accessorKey: "createdAt",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Created
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => new Date(info.getValue() as Date).toLocaleDateString(),
            },
        ],
        [isCompact, circle.handle], // Add dependencies
    );

    const table = useReactTable({
        data: data,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            sorting,
            columnFilters,
            columnVisibility: {
                title: true,
                stage: true,
                assignee: true,
                author: !isCompact,
                createdAt: !isCompact,
            },
        },
    });

    useEffect(() => {
        if (stageFilter !== "all") {
            table.getColumn("stage")?.setFilterValue(stageFilter);
        } else {
            table.getColumn("stage")?.setFilterValue(undefined);
        }
    }, [stageFilter, table]);

    const onConfirmDeleteTask = async () => {
        // Renamed function
        if (!selectedTask) return; // Renamed state

        startTransition(async () => {
            const result = await deleteTaskAction(circle.handle!, selectedTask._id as string); // Renamed action, state

            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh data
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete task", // Updated message
                    variant: "destructive",
                });
            }
            setDeleteTaskDialogOpen(false); // Renamed state setter
            setSelectedTask(null); // Renamed state setter
        });
    };

    const handleRowClick = (task: TaskDisplay) => {
        // Renamed param, type
        if (isCompact) {
            router.push(`/circles/${circle.handle}/tasks/${task._id}`); // Updated path
            return;
        }

        // Open content preview for non-compact mode
        let contentPreviewData: ContentPreviewData = {
            type: "task", // Use the correct type
            content: task, // Renamed param
            props: { circle, permissions }, // Pass required props
        };
        setContentPreview((x) => {
            // Toggle behavior: if clicking the same task again while preview is open, close it.
            const isCurrentlyPreviewing =
                x?.type === "task" && x?.content._id === task._id && sidePanelContentVisible === "content"; // Updated type, param
            return isCurrentlyPreviewing ? undefined : contentPreviewData;
        });
    };

    const openAuthor = (author: Circle) => {
        if (isCompact) {
            router.push(`/circles/${author.handle}`); // Navigate to user profile page on compact
            return;
        }
        // Open user preview in side panel
        let contentPreviewData: ContentPreviewData = { type: "user", content: author };
        setContentPreview((x) => {
            const isCurrentlyPreviewing =
                x?.type === "user" && x?.content._id === author._id && sidePanelContentVisible === "content";
            return isCurrentlyPreviewing ? undefined : contentPreviewData;
        });
    };

    const openAssignee = (assignee: Circle) => {
        openAuthor(assignee); // Reuse the same logic as opening author profile
    };

    // Check create permission for the button using the user object
    const canCreateTask = isAuthorized(user, circle, features.tasks.create); // Renamed variable, updated feature

    return (
        <TooltipProvider>
            <div className="flex flex-1 flex-row justify-center">
                <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                    <div className="flex w-full flex-row items-center gap-2">
                        <div className="flex flex-1 flex-col">
                            <Input
                                placeholder="Search tasks by title..." // Updated placeholder
                                value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
                                onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
                            />
                        </div>
                        {canCreateTask && ( // Renamed variable
                            <Button asChild>
                                <Link href={`/circles/${circle.handle}/tasks/create`}>
                                    {" "}
                                    {/* Updated path */}
                                    <Plus className="mr-2 h-4 w-4" /> Create Task {/* Updated text */}
                                </Link>
                            </Button>
                        )}
                        <Select
                            value={stageFilter}
                            onValueChange={(value) => setStageFilter(value as TaskStage | "all")} // Updated type
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by stage" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stages</SelectItem>
                                <SelectItem value="review">Review</SelectItem>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="inProgress">In Progress</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                            </SelectContent>
                        </Select>
                        {/* Placeholder for Assignee Filter */}
                        {/* <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>...</Select> */}
                    </div>

                    <div className="mt-3 overflow-hidden rounded-[15px] shadow-lg">
                        <Table className="overflow-hidden">
                            <TableHeader className="bg-white">
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id} className="!border-b-0">
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        ))}
                                        <TableHead className="w-[40px]"></TableHead>
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody className="bg-white">
                                {table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row, index) => {
                                        const task = row.original; // Renamed variable
                                        const isAuthor = user?.did === task.createdBy; // Renamed variable
                                        // Determine if edit/delete should be shown
                                        const canEdit =
                                            (isAuthor && task.stage === "review") || permissions.canModerate; // Renamed variable
                                        const canDelete = isAuthor || permissions.canModerate;

                                        return (
                                            <motion.tr
                                                key={row.id}
                                                custom={index}
                                                initial="hidden"
                                                animate="visible"
                                                variants={tableRowVariants}
                                                className={`cursor-pointer
                                                    ${row.getIsSelected() ? "bg-muted" : ""}
                                                    ${(contentPreview?.content as TaskDisplay)?._id === task._id && sidePanelContentVisible === "content" ? "bg-gray-100" : "hover:bg-gray-50"} // Updated type, variable
                                                `}
                                                onClick={() => handleRowClick(task)} // Renamed param
                                            >
                                                {/* Start children immediately */}
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id}>
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                                {/* No space after map */}
                                                <TableCell className="w-[40px]">
                                                    {(canEdit || canDelete) && (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    className="h-8 w-8 p-0"
                                                                    onClick={(e) => e.stopPropagation()} // Prevent row click
                                                                >
                                                                    <span className="sr-only">Open menu</span>
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                {canEdit && (
                                                                    <DropdownMenuItem
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            router.push(
                                                                                `/circles/${circle.handle}/tasks/${task._id}/edit`, // Updated path
                                                                            );
                                                                        }}
                                                                        disabled={task.stage === "resolved"} // Can't edit resolved tasks, Renamed variable
                                                                    >
                                                                        Edit
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {canDelete && (
                                                                    <DropdownMenuItem
                                                                        className="text-red-600"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedTask(task); // Renamed state setter, param
                                                                            setDeleteTaskDialogOpen(true); // Renamed state setter
                                                                        }}
                                                                    >
                                                                        Delete
                                                                    </DropdownMenuItem>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </TableCell>
                                            </motion.tr>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                                            No tasks found. {/* Updated text */}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <Dialog open={deleteTaskDialogOpen} onOpenChange={setDeleteTaskDialogOpen}>
                        {" "}
                        {/* Renamed state */}
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Delete Task</DialogTitle> {/* Updated text */}
                                <DialogDescription>
                                    Are you sure you want to delete the task "{selectedTask?.title}"? This{" "}
                                    {/* Renamed state & fixed quotes */}
                                    action cannot be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button variant="destructive" onClick={onConfirmDeleteTask} disabled={isPending}>
                                    {" "}
                                    {/* Renamed handler */}
                                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Delete
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </TooltipProvider>
    );
};

export default TasksList; // Renamed export

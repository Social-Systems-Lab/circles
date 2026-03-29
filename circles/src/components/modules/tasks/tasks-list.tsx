//task-list.tsx
"use client";

import React, { useEffect, useState, useTransition, useCallback, useMemo } from "react";
import {
    ColumnDef,
    ColumnFiltersState,
    Row,
    SortingState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Circle, ContentPreviewData, TaskDisplay, TaskStage, TaskPermissions, TaskPriority } from "@/models/models"; // Use Task types, Added ContentPreviewData, TaskPermissions
import { Button } from "@/components/ui/button";
import {
    ArrowDown,
    ArrowUp,
    CheckCircle,
    ChevronDown,
    Clock,
    Loader2,
    MoreHorizontal,
    Play,
    Plus,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
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
import { deleteTaskAction } from "@/app/circles/[handle]/tasks/actions";
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useAtom } from "jotai";
import { userAtom, contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import Link from "next/link"; // Will be removed for the button
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CreateTaskDialog } from "@/components/global-create/create-task-dialog"; // Import CreateTaskDialog
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
interface TasksListProps {
    tasksData: {
        tasks: TaskDisplay[];
        hasUserRanked: boolean;
        totalRankers: number;
        unrankedCount: number;
        userRankBecameStaleAt: Date | null;
    };
    circle: Circle;
    permissions: TaskPermissions;
    hideRank?: boolean;
    inToolbox?: boolean;
    onTaskNavigate?: () => void;
    persistViewState?: boolean;
}

const SortIcon = ({ sortDir }: { sortDir: string | boolean }) => {
    if (!sortDir) return null;
    return sortDir === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
};

const allTaskStages: TaskStage[] = ["open", "inProgress", "review", "resolved"];
const allTaskPriorities: TaskPriority[] = ["low", "medium", "high", "critical"];
const defaultTasksListSorting: SortingState = [{ id: "createdAt", desc: true }];
const tasksListViewStateVersion = 1;
const taskPriorityBadgeClasses: Record<TaskPriority, string> = {
    low: "bg-green-100 text-green-800",
    medium: "bg-blue-100 text-blue-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
};
const taskPriorityLabels: Record<TaskPriority, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
};
const taskPrioritySortOrder: Record<TaskPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};
const getSortableCircleLabel = (circle?: Circle) =>
    circle?.name?.trim().toLocaleLowerCase() || circle?.handle?.trim().toLocaleLowerCase() || "";
const sortableTaskColumnIds = new Set(["title", "priority", "stage", "assignee", "createdAt"]);

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

type PersistedTasksListViewState = {
    version: number;
    searchText: string;
    sorting: SortingState;
    selectedStages: TaskStage[];
    selectedPriorities: TaskPriority[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const sanitizeSelectedStages = (value: unknown): TaskStage[] => {
    if (!Array.isArray(value)) {
        return allTaskStages;
    }

    const nextStages = Array.from(
        new Set(value.filter((item): item is TaskStage => allTaskStages.includes(item as TaskStage))),
    );

    return nextStages.length > 0 ? nextStages : allTaskStages;
};

const sanitizeSelectedPriorities = (value: unknown): TaskPriority[] => {
    if (!Array.isArray(value)) {
        return allTaskPriorities;
    }

    const nextPriorities = Array.from(
        new Set(
            value.filter((item): item is TaskPriority => allTaskPriorities.includes(item as TaskPriority)),
        ),
    );

    return nextPriorities.length > 0 ? nextPriorities : allTaskPriorities;
};

const sanitizeSorting = (value: unknown): SortingState => {
    if (!Array.isArray(value)) {
        return defaultTasksListSorting;
    }

    const nextSorting = value
        .filter(
            (item): item is { id: string; desc: boolean } =>
                isRecord(item) &&
                typeof item.id === "string" &&
                sortableTaskColumnIds.has(item.id) &&
                typeof item.desc === "boolean",
        )
        .map((item) => ({ id: item.id, desc: item.desc }));

    return nextSorting.length > 0 ? nextSorting : defaultTasksListSorting;
};

const sanitizePersistedTasksListViewState = (value: unknown): PersistedTasksListViewState | null => {
    if (!isRecord(value) || value.version !== tasksListViewStateVersion) {
        return null;
    }

    return {
        version: tasksListViewStateVersion,
        searchText: typeof value.searchText === "string" ? value.searchText : "",
        sorting: sanitizeSorting(value.sorting),
        selectedStages: sanitizeSelectedStages(value.selectedStages),
        selectedPriorities: sanitizeSelectedPriorities(value.selectedPriorities),
    };
};

const TasksList: React.FC<TasksListProps> = ({
    tasksData,
    circle,
    permissions,
    inToolbox,
    onTaskNavigate,
    persistViewState = false,
}) => {
    // Renamed component, props
    const { tasks } = tasksData;
    const [user] = useAtom(userAtom);
    const [includeCreated, setIncludeCreated] = useState(true);
    const [includeAssigned, setIncludeAssigned] = useState(true);
    const [filteredTasks, setFilteredTasks] = useState(tasksData.tasks);
    const data = React.useMemo(() => {
        const baseTasks =
            circle.circleType === "user" && user?.did === circle.did ? filteredTasks : tasks;

        if (inToolbox) {
            return baseTasks.filter((task) => task.stage !== "resolved");
        }

        return baseTasks;
    }, [tasks, filteredTasks, circle.circleType, circle.did, user?.did, inToolbox]);
    const [sorting, setSorting] = React.useState<SortingState>(defaultTasksListSorting);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState<boolean>(false); // Renamed state
    const [selectedTask, setSelectedTask] = useState<TaskDisplay | null>(null); // Renamed state, updated type
    const [isPending, startTransition] = useTransition();
    const isCompact = useIsCompact();
    const router = useRouter();
    const { toast } = useToast();
    const [searchText, setSearchText] = useState("");
    const [selectedStages, setSelectedStages] = useState<TaskStage[]>(allTaskStages);
    const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>(allTaskPriorities);
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [isCreateTaskDialogOpen, setIsCreateTaskDialogOpen] = useState(false); // State for Create Task Dialog
    const [isResolvedSectionOpen, setIsResolvedSectionOpen] = useState(false);
    const shouldPersistViewState = persistViewState && !inToolbox;
    const tasksListViewStateStorageKey = useMemo(() => {
        if (!shouldPersistViewState) {
            return null;
        }

        const userKey = user?.did || "anonymous";
        const circleKey = circle.handle || String(circle._id || "unknown-circle");
        return `tasks-list-view:${userKey}:${circleKey}`;
    }, [shouldPersistViewState, user?.did, circle.handle, circle._id]);

    useEffect(() => {
        const fetchTasks = async () => {
            if (circle.circleType === "user" && user?.did === circle.did) {
                const data = await getTasksAction(circle.handle!, includeCreated, includeAssigned);
                setFilteredTasks(data.tasks);
            }
        };

        fetchTasks();
    }, [includeCreated, includeAssigned, circle, user]);

    const openAuthor = useCallback(
        (author: Circle) => {
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
        },
        [isCompact, router, setContentPreview, sidePanelContentVisible],
    );

    const openAssignee = useCallback(
        (assignee: Circle) => {
            openAuthor(assignee); // Reuse the same logic as opening author profile
        },
        [openAuthor],
    );

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        if (tasksListViewStateStorageKey) {
            try {
                const rawState = localStorage.getItem(tasksListViewStateStorageKey);
                if (rawState) {
                    const savedState = sanitizePersistedTasksListViewState(JSON.parse(rawState));
                    if (savedState) {
                        setSearchText(savedState.searchText);
                        setSorting(savedState.sorting);
                        setSelectedStages(savedState.selectedStages);
                        setSelectedPriorities(savedState.selectedPriorities);
                    }
                }
            } catch {
                // Ignore unreadable persisted state and fall back to defaults.
            }
        }

        setIsMounted(true);
    }, [tasksListViewStateStorageKey]);

    const areAllStagesSelected = selectedStages.length === allTaskStages.length;
    const stageFilterLabel = useMemo(() => {
        if (areAllStagesSelected) {
            return "All Stages";
        }
        if (selectedStages.length === 1) {
            return getStageInfo(selectedStages[0]).text;
        }
        return `${selectedStages.length} Stages`;
    }, [areAllStagesSelected, selectedStages]);
    const areAllPrioritiesSelected = selectedPriorities.length === allTaskPriorities.length;
    const priorityFilterLabel = useMemo(() => {
        if (areAllPrioritiesSelected) {
            return "All Priorities";
        }
        if (selectedPriorities.length === 1) {
            return taskPriorityLabels[selectedPriorities[0]];
        }
        return `${selectedPriorities.length} Priorities`;
    }, [areAllPrioritiesSelected, selectedPriorities]);

    const toggleStageFilter = useCallback((stage: TaskStage) => {
        setSelectedStages((currentStages) => {
            if (currentStages.includes(stage)) {
                const nextStages = currentStages.filter((value) => value !== stage);
                return nextStages.length === 0 ? allTaskStages : nextStages;
            }

            return [...currentStages, stage];
        });
    }, []);
    const togglePriorityFilter = useCallback((priority: TaskPriority) => {
        setSelectedPriorities((currentPriorities) => {
            if (currentPriorities.includes(priority)) {
                const nextPriorities = currentPriorities.filter((value) => value !== priority);
                return nextPriorities.length === 0 ? allTaskPriorities : nextPriorities;
            }

            return [...currentPriorities, priority];
        });
    }, []);

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
                            href={`/circles/${circle.handle}/tasks/${task._id}#circle-tabs`} // Updated path
                            onClick={(e) => {
                                e.stopPropagation();
                                if (inToolbox) {
                                    onTaskNavigate?.();
                                }
                            }}
                            className="flex items-center font-medium text-blue-600 hover:underline"
                        >
                            {info.getValue() as string}
                            {task.circle && task.circle._id !== circle._id && (
                                <div className="ml-2">
                                    <CirclePicture circle={task.circle} size="24px" />
                                </div>
                            )}
                        </Link>
                    );
                },
            },
            {
                accessorKey: "priority",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Priority
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const priority = info.getValue() as TaskPriority | undefined;
                    return priority ? (
                        <Badge className={taskPriorityBadgeClasses[priority]}>{taskPriorityLabels[priority]}</Badge>
                    ) : null;
                },
                filterFn: (row, id, value) => {
                    if (!Array.isArray(value) || value.length === 0) {
                        return true;
                    }

                    const rowValue = row.getValue(id) as TaskPriority | undefined;
                    return rowValue ? value.includes(rowValue) : false;
                },
                sortingFn: (rowA, rowB, id) => {
                    const priorityA = rowA.getValue(id) as TaskPriority | undefined;
                    const priorityB = rowB.getValue(id) as TaskPriority | undefined;

                    const rankA = priorityA ? taskPrioritySortOrder[priorityA] : 0;
                    const rankB = priorityB ? taskPrioritySortOrder[priorityB] : 0;

                    return rankA - rankB;
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
                filterFn: (row, id, value) => {
                    if (!Array.isArray(value) || value.length === 0) {
                        return true;
                    }

                    return value.includes(row.getValue(id));
                },
            },
            {
                accessorKey: "assignee",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Assigned To
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
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
                sortingFn: (rowA, rowB, id) => {
                    const assigneeA = getSortableCircleLabel(rowA.getValue(id) as Circle | undefined);
                    const assigneeB = getSortableCircleLabel(rowB.getValue(id) as Circle | undefined);

                    if (assigneeA === assigneeB) {
                        return 0;
                    }

                    if (!assigneeA) {
                        return 1;
                    }

                    if (!assigneeB) {
                        return -1;
                    }

                    return assigneeA.localeCompare(assigneeB);
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
        [isCompact, circle.handle, circle._id, openAssignee, openAuthor, inToolbox, onTaskNavigate],
    );

    const table = useReactTable({
        data,
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
                priority: true,
                stage: true,
                assignee: !isCompact && !inToolbox,
                author: !isCompact && !inToolbox,
                createdAt: !isCompact && !inToolbox,
            },
        },
    });

    useEffect(() => {
        table.getColumn("title")?.setFilterValue(searchText || undefined);
    }, [searchText, table]);
    useEffect(() => {
        if (areAllStagesSelected) {
            table.getColumn("stage")?.setFilterValue(undefined);
            return;
        }

        table.getColumn("stage")?.setFilterValue(selectedStages);
    }, [areAllStagesSelected, selectedStages, table]);
    useEffect(() => {
        if (areAllPrioritiesSelected) {
            table.getColumn("priority")?.setFilterValue(undefined);
            return;
        }

        table.getColumn("priority")?.setFilterValue(selectedPriorities);
    }, [areAllPrioritiesSelected, selectedPriorities, table]);
    useEffect(() => {
        if (!isMounted || !tasksListViewStateStorageKey) {
            return;
        }

        const nextState: PersistedTasksListViewState = {
            version: tasksListViewStateVersion,
            searchText,
            sorting,
            selectedStages,
            selectedPriorities,
        };

        try {
            localStorage.setItem(tasksListViewStateStorageKey, JSON.stringify(nextState));
        } catch {
            // Ignore storage write failures and keep the current in-memory state.
        }
    }, [isMounted, searchText, selectedPriorities, selectedStages, sorting, tasksListViewStateStorageKey]);

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
        if (inToolbox) {
            router.push(`/circles/${circle.handle}/tasks/${task._id}#circle-tabs`); // Updated path
            onTaskNavigate?.();
            return;
        }

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

    // Check create permission for the button using the user object
    const canCreateTask = isAuthorized(user, circle, features.tasks.create);

    if (!isMounted) {
        return null; // Prevent rendering until mounted
    }

    const tableRows = table.getRowModel().rows;
    const activeRows = inToolbox
        ? tableRows
        : tableRows.filter((row) => row.original.stage === "open" || row.original.stage === "inProgress" || row.original.stage === "review");
    const resolvedRows = inToolbox ? [] : tableRows.filter((row) => row.original.stage === "resolved");
    const shouldAutoExpandResolvedSection = !inToolbox && activeRows.length === 0 && resolvedRows.length > 0;
    const resolvedSectionOpen = shouldAutoExpandResolvedSection || isResolvedSectionOpen;
    const activeEmptyMessage =
        !inToolbox && resolvedRows.length > 0
            ? "No active tasks match the current filters. Resolved matches are available below."
            : "No tasks found.";

    const handleCreateTaskSuccess = (data: { id?: string; circleHandle?: string }) => {
        toast({
            title: "Task Created",
            description: "The new task has been successfully created.",
        });
        setIsCreateTaskDialogOpen(false);
        router.refresh(); // Refresh the list
        // Navigate to the new task:
        if (data.id && data.circleHandle) {
            router.push(`/circles/${data.circleHandle}/tasks/${data.id}`);
        } else if (data.id) {
            // Fallback if circleHandle is somehow not passed
            router.push(`/circles/${circle.handle}/tasks/${data.id}`);
        }
    };

    const renderTaskRow = (row: Row<TaskDisplay>, index: number) => {
        const task = row.original;
        const isAuthor = user?.did === task.createdBy;
        const canEdit = (isAuthor && task.stage === "review") || permissions.canModerate;
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
                onClick={() => handleRowClick(task)}
            >
                {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
                {!inToolbox && (
                    <TableCell className="w-[40px]">
                        {(canEdit || canDelete) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={(e) => e.stopPropagation()}
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
                                                router.push(`/circles/${circle.handle}/tasks/${task._id}/edit`);
                                            }}
                                            disabled={task.stage === "resolved"}
                                        >
                                            Edit
                                        </DropdownMenuItem>
                                    )}
                                    {canDelete && (
                                        <DropdownMenuItem
                                            className="text-red-600"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedTask(task);
                                                setDeleteTaskDialogOpen(true);
                                            }}
                                        >
                                            Delete
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </TableCell>
                )}
            </motion.tr>
        );
    };

    const renderTaskTable = (rows: Row<TaskDisplay>[], emptyMessage: string) => (
        <div className="overflow-hidden rounded-[15px] shadow-lg">
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
                            {!inToolbox && <TableHead className="w-[40px]"></TableHead>}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody className="bg-white">
                    {rows.length ? (
                        rows.map((row, index) => renderTaskRow(row, index))
                    ) : (
                        <TableRow>
                            <TableCell
                                colSpan={columns.length + 1}
                                className={inToolbox ? "p-8 text-center text-muted-foreground" : "h-24 text-center"}
                            >
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <TooltipProvider>
            <div className="flex flex-1 flex-row justify-center">
                <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                    {!inToolbox && (
                        <div className="flex w-full flex-wrap items-center gap-2">
                            <div className="flex flex-1 flex-col">
                                <Input
                                    placeholder="Search tasks by title..." // Updated placeholder
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                            </div>
                            {canCreateTask && (
                                <Button onClick={() => setIsCreateTaskDialogOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" /> Create Task
                                </Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="min-w-[180px] justify-between">
                                        {stageFilterLabel}
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[220px]">
                                    <DropdownMenuItem
                                        onSelect={(event) => {
                                            event.preventDefault();
                                            setSelectedStages(allTaskStages);
                                        }}
                                    >
                                        All Stages
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {allTaskStages.map((stage) => (
                                        <DropdownMenuCheckboxItem
                                            key={stage}
                                            checked={selectedStages.includes(stage)}
                                            onCheckedChange={() => toggleStageFilter(stage)}
                                        >
                                            {getStageInfo(stage).text}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="min-w-[180px] justify-between">
                                        {priorityFilterLabel}
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[220px]">
                                    <DropdownMenuItem
                                        onSelect={(event) => {
                                            event.preventDefault();
                                            setSelectedPriorities(allTaskPriorities);
                                        }}
                                    >
                                        All Priorities
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {allTaskPriorities.map((priority) => (
                                        <DropdownMenuCheckboxItem
                                            key={priority}
                                            checked={selectedPriorities.includes(priority)}
                                            onCheckedChange={() => togglePriorityFilter(priority)}
                                        >
                                            {taskPriorityLabels[priority]}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                    {!inToolbox && circle.circleType === "user" && user?.did === circle.did && (
                        <div className="flex items-center gap-4 py-2">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="includeCreated"
                                    checked={includeCreated}
                                    onCheckedChange={(checked) => setIncludeCreated(Boolean(checked))}
                                />
                                <Label htmlFor="includeCreated">Show created</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="includeAssigned"
                                    checked={includeAssigned}
                                    onCheckedChange={(checked) => setIncludeAssigned(Boolean(checked))}
                                />
                                <Label htmlFor="includeAssigned">Show assigned</Label>
                            </div>
                        </div>
                    )}

                    <div className="mt-3">{renderTaskTable(activeRows, activeEmptyMessage)}</div>

                    {!inToolbox && resolvedRows.length > 0 && (
                        <Collapsible
                            open={resolvedSectionOpen}
                            onOpenChange={setIsResolvedSectionOpen}
                            className="mt-6 overflow-hidden rounded-[15px] border border-gray-200 bg-white shadow-lg"
                        >
                            <CollapsibleTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="flex w-full items-center justify-between rounded-none px-4 py-6 text-left text-base font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                >
                                    <span>Review resolved tasks ({resolvedRows.length})</span>
                                    <ChevronDown
                                        className={`h-4 w-4 transition-transform ${
                                            resolvedSectionOpen ? "rotate-180" : ""
                                        }`}
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="border-t border-gray-200 p-4 pt-0">
                                <div className="pt-4">{renderTaskTable(resolvedRows, "No resolved tasks found.")}</div>
                            </CollapsibleContent>
                        </Collapsible>
                    )}

                    <Dialog open={deleteTaskDialogOpen} onOpenChange={setDeleteTaskDialogOpen}>
                        {/* Renamed state */}
                        <DialogContent
                            onInteractOutside={(e) => {
                                e.preventDefault();
                            }}
                        >
                            <DialogHeader>
                                <DialogTitle>Delete Task</DialogTitle> {/* Updated text */}
                                <DialogDescription>
                                    Are you sure you want to delete the task &quot;{selectedTask?.title}&quot;? This
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

                    {/* Render CreateTaskDialog */}
                    {canCreateTask && (
                        <CreateTaskDialog
                            isOpen={isCreateTaskDialogOpen}
                            onOpenChange={setIsCreateTaskDialogOpen}
                            onSuccess={handleCreateTaskSuccess}
                            itemKey="task"
                            initialSelectedCircleId={circle._id} // Pass current circle ID
                        />
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
};

export default TasksList; // Renamed export

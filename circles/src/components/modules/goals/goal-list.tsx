//goal-list.tsx
"use client";

import React, { useEffect, useState, useTransition, ChangeEvent, useCallback, useMemo } from "react";
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
import { Circle, ContentPreviewData, GoalDisplay, GoalStage, GoalPermissions } from "@/models/models"; // Use Goal types, Added ContentPreviewData, GoalPermissions
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Plus, CheckCircle, Clock, Play } from "lucide-react";
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
import { deleteGoalAction } from "@/app/circles/[handle]/goals/actions";
import { motion } from "framer-motion";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useAtom } from "jotai";
import { userAtom, contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/components/utils/use-is-mobile";

interface GoalsListProps {
    goalsData: {
        // Simplified props
        goals: GoalDisplay[];
    };
    circle: Circle;
    permissions: GoalPermissions;
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

const formatExpiryDate = (expiryDate: Date): string => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset time part for accurate date comparison
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    const expiryDateOnly = new Date(expiryDate);
    expiryDateOnly.setHours(0, 0, 0, 0);

    if (expiryDateOnly.getTime() === today.getTime()) {
        return "end of today";
    }
    if (expiryDateOnly.getTime() === tomorrow.getTime()) {
        return "tomorrow";
    }
    // Example: "April 15th" - adjust formatting as needed
    return expiryDate.toLocaleDateString(undefined, { month: "long", day: "numeric" });
};

// Helper function for stage badge styling and icons
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

const GoalsList: React.FC<GoalsListProps> = ({ goalsData, circle, permissions }) => {
    const { goals } = goalsData; // Simplified destructuring
    const data = React.useMemo(() => goals, [goals]);
    const [user] = useAtom(userAtom);
    const [sorting, setSorting] = React.useState<SortingState>([{ id: "createdAt", desc: true }]); // Default sort by createdAt
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [deleteGoalDialogOpen, setDeleteGoalDialogOpen] = useState<boolean>(false);
    const [selectedGoal, setSelectedGoal] = useState<GoalDisplay | null>(null);
    const [isPending, startTransition] = useTransition();
    const isCompact = useIsCompact();
    const router = useRouter();
    const { toast } = useToast();
    const [stageFilter, setStageFilter] = useState<GoalStage | "all">("all"); // Updated type
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    // const [showRankModal, setShowRankModal] = useState(false); // Removed state for modal
    const isMobile = useIsMobile();

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

    // Removed stalenessInfo useMemo block

    const columns = React.useMemo<ColumnDef<GoalDisplay>[]>(
        () => [
            // Removed Rank columns
            {
                accessorKey: "title",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Title
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const goal = info.row.original; // Renamed variable
                    return (
                        <Link
                            href={`/circles/${circle.handle}/goals/${goal._id}`} // Updated path
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center font-medium text-blue-600 hover:underline" // Added flex
                        >
                            {info.getValue() as string}
                        </Link>
                    );
                },
            },
            {
                // Added Target Date column
                accessorKey: "targetDate",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Target Date
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const date = info.getValue() as Date | undefined;
                    return date ? new Date(date).toLocaleDateString() : <span className="text-gray-400">-</span>;
                },
            },
            {
                accessorKey: "createdAt",
                header: ({ column }) => (
                    <Button variant="ghost" onClick={() => column.toggleSorting()}>
                        Stage
                        <SortIcon sortDir={column.getIsSorted()} />
                    </Button>
                ),
                cell: (info) => {
                    const stage = info.getValue() as GoalStage; // Updated type
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
        [circle.handle], // Add dependencies
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
                // Removed rank columns
                title: true,
                stage: true,
                targetDate: !isCompact, // Added targetDate visibility
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

    const onConfirmDeleteGoal = async () => {
        // Renamed function
        if (!selectedGoal) return; // Renamed state

        startTransition(async () => {
            const result = await deleteGoalAction(circle.handle!, selectedGoal._id as string); // Renamed action, state

            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh data
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete goal", // Updated message
                    variant: "destructive",
                });
            }
            setDeleteGoalDialogOpen(false); // Renamed state setter
            setSelectedGoal(null); // Renamed state setter
        });
    };

    const handleRowClick = (goal: GoalDisplay) => {
        // Renamed param, type
        if (isCompact) {
            router.push(`/circles/${circle.handle}/goals/${goal._id}`); // Updated path
            return;
        }

        // Open content preview for non-compact mode
        let contentPreviewData: ContentPreviewData = {
            type: "goal", // Use the correct type
            content: goal, // Renamed param
            props: { circle, permissions }, // Pass required props
        };
        setContentPreview((x) => {
            // Toggle behavior: if clicking the same goal again while preview is open, close it.
            const isCurrentlyPreviewing =
                x?.type === "goal" && x?.content._id === goal._id && sidePanelContentVisible === "content"; // Updated type, param
            return isCurrentlyPreviewing ? undefined : contentPreviewData;
        });
    };

    // Check create permission for the button using the user object
    const canCreateGoal = isAuthorized(user, circle, features.goals.create);

    return (
        <TooltipProvider>
            <div className="flex flex-1 flex-row justify-center">
                <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                    {/* --- Removed Rank Stats and Nudge Boxes --- */}

                    <div className="flex w-full flex-row items-center gap-2">
                        <div className="flex flex-1 flex-col">
                            <Input
                                placeholder="Search goals by title..." // Updated placeholder
                                value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
                                onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
                            />
                        </div>
                        {canCreateGoal && ( // Renamed variable
                            <Button asChild>
                                <Link href={`/circles/${circle.handle}/goals/create`}>
                                    {" "}
                                    {/* Updated path */}
                                    <Plus className="mr-2 h-4 w-4" /> Create Goal {/* Updated text */}
                                </Link>
                            </Button>
                        )}
                        {/* Removed Rank Button */}
                        <Select
                            value={stageFilter}
                            onValueChange={(value) => setStageFilter(value as GoalStage | "all")} // Type cast is correct now after schema change
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by stage" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stages</SelectItem>
                                <SelectItem value="review">Review</SelectItem>
                                <SelectItem value="open">Open</SelectItem>
                                {/* Removed In Progress SelectItem */}
                                <SelectItem value="resolved">Resolved</SelectItem>
                            </SelectContent>
                        </Select>
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
                                        {/* Adjust colspan if rank header is added */}
                                        <TableHead className="w-[40px]"></TableHead>
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody className="bg-white">
                                {table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row, index) => {
                                        const goal = row.original; // Renamed variable
                                        const isAuthor = user?.did === goal.createdBy; // Renamed variable
                                        // Determine if edit/delete should be shown
                                        const canEdit =
                                            (isAuthor && goal.stage === "review") || permissions.canModerate; // Renamed variable
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
                                                    ${(contentPreview?.content as GoalDisplay)?._id === goal._id && sidePanelContentVisible === "content" ? "bg-gray-100" : "hover:bg-gray-50"} // Updated type, variable
                                                `}
                                                onClick={() => handleRowClick(goal)} // Renamed param
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
                                                                                `/circles/${circle.handle}/goals/${goal._id}/edit`, // Updated path
                                                                            );
                                                                        }}
                                                                        disabled={goal.stage === "resolved"} // Can't edit resolved goals, Renamed variable
                                                                    >
                                                                        Edit
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {canDelete && (
                                                                    <DropdownMenuItem
                                                                        className="text-red-600"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedGoal(goal); // Renamed state setter, param
                                                                            setDeleteGoalDialogOpen(true); // Renamed state setter
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
                                            No goals found. {/* Updated text */}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <Dialog open={deleteGoalDialogOpen} onOpenChange={setDeleteGoalDialogOpen}>
                        {/* Renamed state */}
                        <DialogContent
                            onInteractOutside={(e) => {
                                e.preventDefault();
                            }}
                        >
                            <DialogHeader>
                                <DialogTitle>Delete Goal</DialogTitle> {/* Updated text */}
                                <DialogDescription>
                                    Are you sure you want to delete the goal &quot;{selectedGoal?.title}&quot;? This
                                    action cannot be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button variant="destructive" onClick={onConfirmDeleteGoal} disabled={isPending}>
                                    {" "}
                                    {/* Renamed handler */}
                                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Delete
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    {/* Removed Prioritization Modal */}
                </div>
            </div>
        </TooltipProvider>
    );
};

export default GoalsList; // Renamed export

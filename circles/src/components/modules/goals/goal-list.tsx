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
import {
    ArrowDown,
    ArrowUp,
    Loader2,
    MoreHorizontal,
    Plus,
    CheckCircle,
    Clock,
    Play,
    User,
    TriangleAlert,
    CheckCircle2,
} from "lucide-react";
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
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features, RANKING_STALENESS_DAYS } from "@/lib/data/constants"; // Added constants import
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useAtom } from "jotai";
import { userAtom, contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import GoalPrioritizationModal from "./goal-prioritization-modal"; // Import the modal
import { PiRanking, PiRankingBold, PiUser, PiUsersThree } from "react-icons/pi";
import { useIsMobile } from "@/components/utils/use-is-mobile";

interface GoalsListProps {
    goalsData: {
        goals: GoalDisplay[];
        hasUserRanked: boolean;
        totalRankers: number;
        unrankedCount: number;
        userRankBecameStaleAt: Date | null;
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
        case "inProgress":
            return { color: "bg-orange-200 text-orange-800", icon: Loader2, text: "In Progress" };
        case "resolved":
            return { color: "bg-green-200 text-green-800", icon: CheckCircle, text: "Resolved" };
        default:
            return { color: "bg-gray-200 text-gray-800", icon: Clock, text: "Unknown" };
    }
};

const GoalsList: React.FC<GoalsListProps> = ({ goalsData, circle, permissions }) => {
    // Renamed component, props
    const { goals, hasUserRanked, totalRankers, unrankedCount, userRankBecameStaleAt } = goalsData;
    const data = React.useMemo(() => goals, [goals]);
    const [user] = useAtom(userAtom);
    const [sorting, setSorting] = React.useState<SortingState>([{ id: "rank", desc: false }]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [deleteGoalDialogOpen, setDeleteGoalDialogOpen] = useState<boolean>(false); // Renamed state
    const [selectedGoal, setSelectedGoal] = useState<GoalDisplay | null>(null); // Renamed state, updated type
    const [isPending, startTransition] = useTransition();
    const isCompact = useIsCompact();
    const router = useRouter();
    const { toast } = useToast();
    const [stageFilter, setStageFilter] = useState<GoalStage | "all">("all"); // Updated type
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [showRankModal, setShowRankModal] = useState(false); // State for modal
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

    const stalenessInfo = useMemo(() => {
        if (!userRankBecameStaleAt || unrankedCount === 0) {
            return { isStale: false, expiryDate: null, expiryDateString: "" };
        }
        const becameStaleDate = new Date(userRankBecameStaleAt); // Ensure it's a Date
        const expiryDate = new Date(becameStaleDate);
        expiryDate.setDate(expiryDate.getDate() + RANKING_STALENESS_DAYS);

        const now = new Date();
        // Check if grace period has actually expired already
        if (now > expiryDate) {
            // This case means the backend should have excluded it,
            // but we handle it defensively in UI.
            // You might show a different "expired" message here if needed.
            return { isStale: true, expiryDate: expiryDate, expiryDateString: "past", isExpired: true };
        }

        return {
            isStale: true,
            expiryDate: expiryDate,
            expiryDateString: formatExpiryDate(expiryDate),
            isExpired: false,
        };
    }, [userRankBecameStaleAt, unrankedCount]);

    const columns = React.useMemo<ColumnDef<GoalDisplay>[]>( // Updated type
        () => [
            // --- Column 1: Aggregated Rank ---
            {
                accessorKey: "rank",
                header: ({ column }) => (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                                    className="p-1"
                                >
                                    {/* Icon for aggregated rank */}
                                    <PiRankingBold className="h-4 w-4" />
                                    <SortIcon sortDir={column.getIsSorted()} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sort by Aggregated Rank</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ),
                cell: (info) => {
                    const rank = info.getValue() as number | undefined;
                    return rank !== undefined ? (
                        <span className="inline-block min-w-[20px] rounded bg-gray-200 px-1.5 py-0.5 text-center text-xs font-semibold text-gray-700">
                            {rank}
                        </span>
                    ) : (
                        <span className="text-gray-400">-</span>
                    );
                },
                enableSorting: true,
            },
            // --- Column 2: User's Rank (NEW) ---
            {
                accessorKey: "userRank", // Access the new data field
                header: ({ column }) => (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                                    className="p-1"
                                >
                                    {/* Icon indicating user-specific rank */}
                                    <User className="h-4 w-4" />
                                    <SortIcon sortDir={column.getIsSorted()} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sort by Your Rank</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ),
                cell: (info) => {
                    const userRank = info.getValue() as number | undefined;
                    return userRank !== undefined ? (
                        <span className="inline-block min-w-[20px] rounded border border-blue-300 bg-blue-100 px-1.5 py-0.5 text-center text-xs font-semibold text-blue-800">
                            {userRank}
                        </span>
                    ) : (
                        <span className="text-gray-400">-</span>
                    );
                },
                enableSorting: true, // Allow sorting by user rank
            },
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
                accessorKey: "stage",
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
                rank: true,
                userRank: hasUserRanked,
                title: true,
                stage: true,
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
                    {/* --- START: Rank Stats and Nudge Boxes --- */}
                    {hasUserRanked && (
                        <div className="mb-3 rounded border bg-blue-50 p-3 text-sm text-blue-800 shadow-sm">
                            <p className="flex items-center">
                                <PiUsersThree className="mr-2 h-5 w-5 flex-shrink-0" />
                                You&apos;ve ranked these goals.{" "}
                                <span>
                                    {" "}
                                    Currently, <span className="mx-1 font-semibold">{totalRankers}</span>{" "}
                                    {totalRankers === 1 ? "user" : "users"} contributed to the aggregated ranking.
                                </span>
                            </p>
                        </div>
                    )}

                    {/* Show nudge only if user has ranked */}
                    {hasUserRanked && unrankedCount > 0 && (
                        <div
                            className="mb-4 cursor-pointer rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800 shadow-sm transition-colors hover:bg-yellow-100"
                            onClick={() => setShowRankModal(true)} // Open rank modal on click
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && setShowRankModal(true)} // Accessibility
                        >
                            <p className="flex items-center">
                                <TriangleAlert className="mr-2 h-5 w-5 flex-shrink-0 text-yellow-600" />
                                You have{" "}
                                <span className="mx-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                                    {unrankedCount}
                                </span>{" "}
                                unranked goal{unrankedCount !== 1 ? "s" : ""}.
                                {!isMobile && (
                                    <>
                                        {" "}
                                        Please update by{" "}
                                        <span className="mx-1 font-semibold">{stalenessInfo.expiryDateString}</span>
                                        to ensure your ranking continues to be counted. Click here to rank.
                                    </>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Show success message only if user has ranked and count is 0 */}
                    {hasUserRanked && unrankedCount === 0 && (
                        <div className="mb-4 rounded border border-green-400 bg-green-50 p-3 text-sm text-green-800 shadow-sm">
                            <p className="flex items-center">
                                <CheckCircle2 className="mr-2 h-5 w-5 flex-shrink-0 text-green-600" />
                                Nicely done! You&apos;ve ranked all available goals.
                            </p>
                        </div>
                    )}

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
                        {/* Add Rank Button */}
                        {isAuthorized(user, circle, features.goals.rank) && (
                            <Button onClick={() => setShowRankModal(true)}>
                                <PiRanking className="mr-2 h-4 w-4" /> Rank
                            </Button>
                        )}
                        <Select
                            value={stageFilter}
                            onValueChange={(value) => setStageFilter(value as GoalStage | "all")} // Updated type
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
                        <DialogContent>
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
                    {/* Render Prioritization Modal */}
                    {showRankModal && (
                        <GoalPrioritizationModal circle={circle} onClose={() => setShowRankModal(false)} />
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
};

export default GoalsList; // Renamed export

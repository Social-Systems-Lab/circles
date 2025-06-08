"use client";

import React, { useEffect, useState, useTransition, ChangeEvent, useMemo } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, ContentPreviewData, ProposalDisplay, ProposalStage } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Plus, TriangleAlert, CheckCircle2, Target } from "lucide-react"; // Added TriangleAlert, CheckCircle2, Target
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAtom } from "jotai";
import { contentPreviewAtom, sidePanelContentVisibleAtom, userAtom } from "@/lib/data/atoms";
import { features } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth";
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
// Import the new draft action
import { deleteProposalAction } from "@/app/circles/[handle]/proposals/actions"; // Removed createProposalDraftAction
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import CreateGoalDialog from "@/components/global-create/create-goal-dialog"; // Import CreateGoalDialog
import { CreateProposalDialog } from "@/components/global-create/create-proposal-dialog"; // Import CreateProposalDialog
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import Link from "next/link"; // Restored Link import
import { CheckCircle, XCircle, ListOrdered, User as UserIcon } from "lucide-react"; // Import icons for outcome and ranking, UserIcon
import { PiRankingBold, PiUsersThree } from "react-icons/pi"; // For aggregated rank icon, PiUsersThree
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // For tooltips
import ProposalPrioritizationModal from "./proposal-prioritization-modal"; // Import the modal

interface ProposalsListProps {
    proposals: ProposalDisplay[];
    circle: Circle;
    currentTabKey?: "submitted" | "accepted" | "resolved"; // To identify the current context/tab
}

const SortIcon = ({ sortDir }: { sortDir: string | boolean }) => {
    if (!sortDir) return null;

    if (sortDir === "asc") {
        return <ArrowUp className="ml-2 h-4 w-4" />;
    } else {
        return <ArrowDown className="ml-2 h-4 w-4" />;
    }
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

const getStageBadgeColor = (stage: ProposalStage) => {
    switch (stage) {
        case "draft":
            return "bg-gray-200 text-gray-800";
        case "review":
            return "bg-blue-200 text-blue-800";
        case "voting":
            return "bg-green-200 text-green-800";
        case "accepted": // New stage
            return "bg-teal-200 text-teal-800";
        case "implemented": // New stage
            return "bg-indigo-200 text-indigo-800";
        case "rejected": // New stage (was part of resolved)
            return "bg-red-200 text-red-800";
        // 'resolved' is no longer a direct stage, but a conceptual state covered by implemented/rejected
        default:
            return "bg-gray-200 text-gray-800"; // Fallback for any unexpected stage
    }
};

const ProposalsList: React.FC<ProposalsListProps> = ({ proposals, circle, currentTabKey }) => {
    const data = React.useMemo(() => proposals, [proposals]);
    const [sorting, setSorting] = React.useState<SortingState>([{ id: "createdAt", desc: true }]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [user] = useAtom(userAtom);
    const [deleteProposalDialogOpen, setDeleteProposalDialogOpen] = useState<boolean>(false);
    const [selectedProposal, setSelectedProposal] = useState<ProposalDisplay | null>(null);
    const [isPending, startTransition] = useTransition();
    const isCompact = useIsCompact();
    const router = useRouter();
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [stageFilter, setStageFilter] = useState<ProposalStage | "all">("all");
    // const [createProposalDialogOpen, setCreateProposalDialogOpen] = useState<boolean>(false); // Replaced by isMainCreateProposalDialogOpen
    // const [newProposalName, setNewProposalName] = useState<string>(""); // Replaced by form within dialog
    const [isMainCreateProposalDialogOpen, setIsMainCreateProposalDialogOpen] = useState<boolean>(false); // New state for the main dialog
    const [isPrioritizationModalOpen, setIsPrioritizationModalOpen] = useState(false); // State for modal
    const [isCreateGoalDialogOpen, setIsCreateGoalDialogOpen] = useState(false); // State for Create Goal dialog
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    // Aggregate ranking stats for "accepted" tab
    const rankingStats = useMemo(() => {
        if (currentTabKey !== "accepted" || proposals.length === 0) {
            return { totalRankers: 0, hasUserRanked: false, unrankedCount: 0 };
        }
        // Assuming all proposals passed to the list for the 'accepted' tab have these fields populated consistently
        // We take the values from the first proposal as they should be the same for all in this context.
        const firstProposal = proposals[0];
        return {
            totalRankers: firstProposal.totalRankers || 0,
            hasUserRanked: firstProposal.hasUserRanked || false,
            unrankedCount: firstProposal.unrankedCount || 0,
        };
    }, [proposals, currentTabKey]);

    // Check permissions
    const canCreateProposal = isAuthorized(user, circle, features.proposals.create);
    const canModerateProposals = isAuthorized(user, circle, features.proposals.moderate);
    const canRankProposals = isAuthorized(user, circle, features.proposals.rank); // Permission to rank
    const canCreateGoal = isAuthorized(user, circle, features.goals.create); // Permission to create goals

    const { toast } = useToast();

    const columns = React.useMemo<ColumnDef<ProposalDisplay>[]>(() => {
        let columnsToRender: ColumnDef<ProposalDisplay>[] = [];

        // Add rank columns first if on the "accepted" tab
        if (currentTabKey === "accepted") {
            columnsToRender.push(
                {
                    accessorKey: "rank", // Assuming ProposalDisplay will have this for overall rank
                    header: ({ column }) => (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                                        className="p-1"
                                    >
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
                    size: 100, // Adjust size as needed
                } as ColumnDef<ProposalDisplay>,
                {
                    accessorKey: "userRank", // Assuming ProposalDisplay will have this
                    header: ({ column }) => (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                                        className="p-1"
                                    >
                                        <UserIcon className="h-4 w-4" />
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
                    size: 100, // Adjust size as needed
                } as ColumnDef<ProposalDisplay>,
            );
        }

        // Add base columns
        columnsToRender.push(
            {
                accessorKey: "name",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Name
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => {
                    const proposal = info.row.original;
                    return (
                        <Link
                            href={`/circles/${circle.handle}/proposals/${proposal._id}`}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()} // Added type for e
                            className="font-medium text-blue-600 hover:underline"
                        >
                            {info.getValue() as string}
                        </Link>
                    );
                },
            },
            {
                accessorKey: "stage",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Stage
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => {
                    const stage = info.getValue() as ProposalStage;
                    const proposal = info.row.original;
                    const stageDisplay = stage.charAt(0).toUpperCase() + stage.slice(1);
                    let icon = null;
                    let fullText = stageDisplay;

                    if (stage === "implemented") {
                        icon = <CheckCircle className="mr-1 h-3 w-3" />;
                        // Optionally, if you want to show the linked goal's name or ID:
                        // if (proposal.goalId) fullText += ` (Goal: ${proposal.goalId.substring(0,6)}...)`;
                    } else if (stage === "rejected") {
                        icon = <XCircle className="mr-1 h-3 w-3" />;
                        if (proposal.outcomeReason) {
                            // Keep it brief for the badge, full reason in details view
                            // fullText += ` (${proposal.outcomeReason.substring(0, 15)}...)`;
                        }
                    } else if (stage === "accepted") {
                        // Potentially show ranking info here in the future, or just "Accepted"
                        // icon = <ThumbsUp className="mr-1 h-3 w-3" />; // Example icon
                    }
                    // Add other icons for draft, review, voting if desired

                    return (
                        <Badge className={`${getStageBadgeColor(stage)} items-center`}>
                            {icon}
                            {fullText}
                        </Badge>
                    );
                },
                filterFn: (row, id, value) => {
                    return row.getValue(id) === value;
                },
            },
            {
                accessorKey: "author",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Created By
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => {
                    const author = info.getValue() as Circle;
                    return (
                        <div
                            className="flex cursor-pointer items-center gap-2"
                            onClick={(e) => {
                                openAuthor(author);
                                e.stopPropagation();
                            }}
                        >
                            <UserPicture name={author.name} picture={author.picture?.url} size="32px" />
                            <span>{author.name}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: "createdAt",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Created
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => new Date(info.getValue() as Date).toLocaleDateString(),
            },
        );
        return columnsToRender;
    }, [isCompact, currentTabKey, circle.handle]);

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
                name: true,
                stage: true,
                author: !isCompact,
                createdAt: !isCompact,
            },
        },
    });

    useEffect(() => {
        // Filter by stage if a stage filter is selected
        if (stageFilter !== "all") {
            table.getColumn("stage")?.setFilterValue(stageFilter);
        } else {
            table.getColumn("stage")?.setFilterValue(undefined);
        }
    }, [stageFilter, table]); // Added table dependency

    const onConfirmDeleteProposal = async () => {
        if (!selectedProposal) {
            return;
        }

        startTransition(async () => {
            const result = await deleteProposalAction(circle.handle!, selectedProposal._id);

            const success = result.success;
            const message = "Proposal deleted successfully";

            if (success) {
                toast({
                    title: "Success",
                    description: message,
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: message || "Failed to delete proposal",
                    variant: "destructive",
                });
            }

            setDeleteProposalDialogOpen(false);
            setSelectedProposal(null); // Clear selected proposal
        });
    };

    // This custom dialog logic is being replaced by CreateProposalDialog
    // const onConfirmCreateProposal = async () => { ... };

    const openAuthor = (author: Circle) => {
        if (isCompact) {
            router.push(`/circles/${author.handle}`);
            return;
        }

        // Open content preview for non-compact mode
        let contentPreviewData: ContentPreviewData = {
            type: "user", // Use the correct type
            content: author,
        };
        setContentPreview((x) => {
            // Toggle behavior: if clicking the same proposal again while preview is open, close it.
            const isCurrentlyPreviewing =
                x?.type === "user" && x?.content._id === author._id && sidePanelContentVisible === "content";
            return isCurrentlyPreviewing ? undefined : contentPreviewData;
        });
    };

    const handleRowClick = (proposal: ProposalDisplay) => {
        if (isCompact) {
            router.push(`/circles/${circle.handle}/proposals/${proposal._id}`);
            return;
        }

        // Open content preview for non-compact mode
        let contentPreviewData: ContentPreviewData = {
            type: "proposal", // Use the correct type
            content: proposal,
            props: { circle },
        };
        setContentPreview((x) => {
            // Toggle behavior: if clicking the same proposal again while preview is open, close it.
            const isCurrentlyPreviewing =
                x?.type === "proposal" && x?.content._id === proposal._id && sidePanelContentVisible === "content";
            return isCurrentlyPreviewing ? undefined : contentPreviewData;
        });
    };

    // const handleCreateProposalClick = () => { // Replaced by setIsMainCreateProposalDialogOpen(true)
    //     setNewProposalName("");
    //     setCreateProposalDialogOpen(true);
    // };

    const handleCreateProposalSuccess = (proposalId?: string) => {
        toast({
            title: "Proposal Created",
            description: "The new proposal has been successfully created.",
        });
        setIsMainCreateProposalDialogOpen(false);
        router.refresh(); // Refresh the list
        if (proposalId) {
            // Optionally navigate to the new proposal or its edit page
            router.push(`/circles/${circle.handle}/proposals/${proposalId}/edit`);
        }
    };

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-4 flex max-w-[1100px] flex-1 flex-col">
                {/* --- START: Rank Stats and Nudge Boxes (for 'accepted' tab) --- */}
                {currentTabKey === "accepted" && (
                    <>
                        {rankingStats.hasUserRanked && (
                            <div className="mb-3 rounded border bg-blue-50 p-3 text-sm text-blue-800 shadow-sm">
                                <p className="flex items-center">
                                    <PiUsersThree className="mr-2 h-5 w-5 flex-shrink-0" />
                                    You've ranked these proposals.{" "}
                                    <span>
                                        {" "}
                                        Currently,{" "}
                                        <span className="mx-1 font-semibold">{rankingStats.totalRankers}</span>{" "}
                                        {rankingStats.totalRankers === 1 ? "user" : "users"} contributed to the
                                        aggregated ranking.
                                    </span>
                                </p>
                            </div>
                        )}

                        {rankingStats.hasUserRanked && rankingStats.unrankedCount > 0 && (
                            <div
                                className="mb-4 cursor-pointer rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800 shadow-sm transition-colors hover:bg-yellow-100"
                                onClick={() => setIsPrioritizationModalOpen(true)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && setIsPrioritizationModalOpen(true)}
                            >
                                <p className="flex items-center">
                                    <TriangleAlert className="mr-2 h-5 w-5 flex-shrink-0 text-yellow-600" />
                                    You have{" "}
                                    <span className="mx-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                                        {rankingStats.unrankedCount}
                                    </span>{" "}
                                    unranked proposal{rankingStats.unrankedCount !== 1 ? "s" : ""}.
                                    {/* Staleness info omitted for now */}
                                    {!isCompact && " Click here to rank."}
                                </p>
                            </div>
                        )}

                        {rankingStats.hasUserRanked && rankingStats.unrankedCount === 0 && (
                            <div className="mb-4 rounded border border-green-400 bg-green-50 p-3 text-sm text-green-800 shadow-sm">
                                <p className="flex items-center">
                                    <CheckCircle2 className="mr-2 h-5 w-5 flex-shrink-0 text-green-600" />
                                    Nicely done! You've ranked all available proposals.
                                </p>
                            </div>
                        )}
                    </>
                )}
                {/* --- END: Rank Stats and Nudge Boxes --- */}

                <div className="flex w-full flex-row items-center gap-2">
                    <div className="flex flex-1 flex-col">
                        <Input
                            placeholder="Search proposals..."
                            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {hasMounted && canCreateProposal && (
                            <Button onClick={() => setIsMainCreateProposalDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Create Proposal
                            </Button>
                        )}
                        {hasMounted && currentTabKey === "accepted" && canRankProposals && (
                            <Button onClick={() => setIsPrioritizationModalOpen(true)}>
                                {" "}
                                {/* Blue button by default */}
                                <ListOrdered className="mr-2 h-4 w-4" /> Rank
                            </Button>
                        )}
                    </div>
                    <Select
                        value={stageFilter}
                        onValueChange={(value) => setStageFilter(value as ProposalStage | "all")}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by stage" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Stages</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="review">Review</SelectItem>
                            <SelectItem value="voting">Voting</SelectItem>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="implemented">Implemented</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="mt-3 overflow-hidden rounded-[15px] shadow-lg">
                    <Table className="overflow-hidden">
                        <TableHeader className="bg-white">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id} className="!border-b-0">
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        );
                                    })}
                                    <TableHead className="w-[40px]"></TableHead>
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody className="bg-white">
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row, index) => {
                                    const proposal = row.original;
                                    const isAuthor = user && proposal.createdBy === user?.did;
                                    const isActive = (contentPreview?.content as ProposalDisplay)?._id === proposal._id;

                                    // Determine if edit/delete should be shown based on new stage logic
                                    // Defer permission-based rendering until client-side mount
                                    const canEditThisProposal =
                                        hasMounted &&
                                        (canModerateProposals ||
                                            (isAuthor && ["draft", "review"].includes(proposal.stage)));
                                    const canDeleteThisProposal = hasMounted && (canModerateProposals || isAuthor);
                                    const showCreateGoalButton =
                                        hasMounted &&
                                        currentTabKey === "accepted" &&
                                        proposal.stage === "accepted" &&
                                        canCreateGoal;

                                    return (
                                        <motion.tr
                                            key={row.id}
                                            custom={index}
                                            initial="hidden"
                                            animate="visible"
                                            variants={tableRowVariants}
                                            className={`cursor-pointer ${row.getIsSelected() ? "bg-muted" : ""}
                                                ${isActive ? "bg-gray-100" : "hover:bg-gray-50"}
                                            `}
                                            onClick={() => handleRowClick(proposal)}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                            <TableCell className="w-[40px]">
                                                {(canEditThisProposal ||
                                                    canDeleteThisProposal ||
                                                    showCreateGoalButton) && (
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
                                                            {showCreateGoalButton && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedProposal(proposal);
                                                                            setIsCreateGoalDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Target className="mr-2 h-4 w-4" />
                                                                        Create Goal
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {canEditThisProposal && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            router.push(
                                                                                `/circles/${circle.handle}/proposals/${proposal._id}/edit`,
                                                                            );
                                                                        }}
                                                                        disabled={!canEditThisProposal} // Explicitly disable if not editable
                                                                    >
                                                                        Edit
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {canDeleteThisProposal && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        className="text-red-600 hover:!text-red-700"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedProposal(proposal);
                                                                            setDeleteProposalDialogOpen(true);
                                                                        }}
                                                                        disabled={!canDeleteThisProposal} // Explicitly disable if not deletable
                                                                    >
                                                                        Delete
                                                                    </DropdownMenuItem>
                                                                </>
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
                                        No proposals found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <Dialog open={deleteProposalDialogOpen} onOpenChange={setDeleteProposalDialogOpen}>
                    <DialogContent
                        onInteractOutside={(e) => {
                            e.preventDefault();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Delete Proposal</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete the proposal "{selectedProposal?.name}"? This action
                                cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={onConfirmDeleteProposal} disabled={isPending}>
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

                {/* Create Proposal Dialog (Main one) */}
                {canCreateProposal && (
                    <CreateProposalDialog
                        isOpen={isMainCreateProposalDialogOpen}
                        onOpenChange={setIsMainCreateProposalDialogOpen}
                        onSuccess={handleCreateProposalSuccess}
                        itemKey="proposal"
                        initialSelectedCircleId={circle._id}
                    />
                )}

                {isPrioritizationModalOpen && (
                    <ProposalPrioritizationModal
                        circle={circle}
                        onClose={() => {
                            setIsPrioritizationModalOpen(false);
                            router.refresh(); // Refresh data after modal closes
                        }}
                    />
                )}

                {/* Create Goal Dialog */}
                {selectedProposal && (
                    <CreateGoalDialog
                        isOpen={isCreateGoalDialogOpen}
                        onOpenChange={setIsCreateGoalDialogOpen}
                        // circle={circle} // CreateGoalDialog gets circle via CircleSelector or if passed directly to GoalForm
                        itemKey="goal" // Assuming 'goal' is the correct key
                        onSuccess={(goalId) => {
                            // Handle successful goal creation, e.g., refresh data or show toast
                            console.log("Goal created with ID:", goalId);
                            setIsCreateGoalDialogOpen(false); // Close dialog
                            router.refresh(); // Refresh the page to show updated proposal stage
                        }}
                        // We will modify CreateGoalDialog to accept 'proposal' prop later
                        // proposal={selectedProposal}
                    />
                )}
            </div>
        </div>
    );
};

export default ProposalsList;

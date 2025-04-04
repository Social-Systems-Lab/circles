"use client";

import React, { useEffect, useState, useTransition } from "react";
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
import { Circle, ContentPreviewData, Page, ProposalDisplay, ProposalStage } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Plus } from "lucide-react";
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
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface ProposalsListProps {
    proposals: ProposalDisplay[];
    circle: Circle;
    page?: Page;
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
        case "resolved":
            return "bg-purple-200 text-purple-800";
        default:
            return "bg-gray-200 text-gray-800";
    }
};

const ProposalsList: React.FC<ProposalsListProps> = ({ proposals, circle, page }) => {
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

    // Check permissions
    const canCreate = isAuthorized(user, circle, features.proposals.create);
    const canModerate = isAuthorized(user, circle, features.proposals.moderate);

    const { toast } = useToast();

    useEffect(() => {
        // Filter by stage if a stage filter is selected
        if (stageFilter !== "all") {
            table.getColumn("stage")?.setFilterValue(stageFilter);
        } else {
            table.getColumn("stage")?.setFilterValue(undefined);
        }
    }, [stageFilter]);

    const columns = React.useMemo<ColumnDef<ProposalDisplay>[]>(
        () => [
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
                    return <div className="font-medium">{info.getValue() as string}</div>;
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
                    return (
                        <Badge className={`${getStageBadgeColor(stage)}`}>
                            {stage.charAt(0).toUpperCase() + stage.slice(1)}
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
                        <div className="flex items-center gap-2">
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
        ],
        [],
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
                name: true,
                stage: true,
                author: !isCompact,
                createdAt: !isCompact,
            },
        },
    });

    const onConfirmDeleteProposal = async () => {
        if (!selectedProposal) {
            return;
        }

        startTransition(async () => {
            // TODO: Implement delete proposal action
            // const result = await deleteProposalAction(selectedProposal._id);

            // Temporary mock implementation
            const success = true;
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
        });
    };

    const handleRowClick = (proposal: ProposalDisplay) => {
        if (isCompact) {
            router.push(`/circles/${circle.handle}/proposals/${proposal._id}`);
            return;
        }

        let contentPreviewData: ContentPreviewData = {
            type: "default",
            content: proposal,
        };
        setContentPreview((x) =>
            x?.content === proposal && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const handleCreateProposal = () => {
        router.push(`/circles/${circle.handle}/proposals/create`);
    };

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <div className="flex w-full flex-row items-center gap-2">
                    <div className="flex flex-1 flex-col">
                        <Input
                            placeholder="Search proposals..."
                            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                        />
                    </div>
                    {canCreate && (
                        <Button onClick={handleCreateProposal}>
                            <Plus className="mr-2 h-4 w-4" /> Create Proposal
                        </Button>
                    )}
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
                            <SelectItem value="resolved">Resolved</SelectItem>
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
                                                {(isAuthor || canModerate) && (
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
                                                            <DropdownMenuItem
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    router.push(
                                                                        `/circles/${circle.handle}/proposals/${proposal._id}/edit`,
                                                                    );
                                                                }}
                                                            >
                                                                Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedProposal(proposal);
                                                                    setDeleteProposalDialogOpen(true);
                                                                }}
                                                            >
                                                                Delete
                                                            </DropdownMenuItem>
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
                    <DialogContent>
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
            </div>
        </div>
    );
};

export default ProposalsList;

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, ContentPreviewData, ProposalDisplay, ProposalStage } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Plus } from "lucide-react";
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
import { createProposalDraftAction, deleteProposalAction } from "@/app/circles/[handle]/proposals/actions";
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import Link from "next/link"; // Import Link
import { CheckCircle, XCircle } from "lucide-react"; // Import icons for outcome

interface ProposalsListProps {
    proposals: ProposalDisplay[];
    circle: Circle;
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

const ProposalsList: React.FC<ProposalsListProps> = ({ proposals, circle }) => {
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
    const [createProposalDialogOpen, setCreateProposalDialogOpen] = useState<boolean>(false);
    const [newProposalName, setNewProposalName] = useState<string>("");

    // Check permissions
    // Check permissions
    const canCreate = isAuthorized(user, circle, features.proposals.create);
    const canModerate = isAuthorized(user, circle, features.proposals.moderate);

    const { toast } = useToast();

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
                    const proposal = info.row.original;
                    return (
                        // Wrap name in a Link that stops propagation
                        <Link
                            href={`/circles/${circle.handle}/proposals/${proposal._id}`}
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
                    let badgeText = stage.charAt(0).toUpperCase() + stage.slice(1);
                    let IconComponent = null;

                    if (stage === "resolved") {
                        if (proposal.outcome === "accepted") {
                            badgeText += " (Accepted)";
                            IconComponent = CheckCircle;
                        } else if (proposal.outcome === "rejected") {
                            badgeText += " (Rejected)";
                            IconComponent = XCircle;
                        }
                    }

                    return (
                        <Badge className={`${getStageBadgeColor(stage)} items-center gap-1`}>
                            {IconComponent && <IconComponent className="h-3 w-3" />}
                            {badgeText}
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

    const onConfirmCreateProposal = async () => {
        if (!newProposalName.trim()) {
            toast({
                title: "Error",
                description: "Proposal name cannot be empty.",
                variant: "destructive",
            });
            return;
        }

        startTransition(async () => {
            // Call the new draft action, passing only the name
            const result = await createProposalDraftAction(circle.handle!, newProposalName.trim());

            // Check for proposalId in the result
            if (result.success && result.proposalId) {
                toast({
                    title: "Success",
                    description: "Proposal draft created. Redirecting to edit...",
                });
                setCreateProposalDialogOpen(false);
                setNewProposalName(""); // Clear input
                // Redirect to the edit page using the returned proposalId
                router.push(`/circles/${circle.handle}/proposals/${result.proposalId}/edit`);
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to create proposal",
                    variant: "destructive",
                });
            }
        });
    };

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

    const handleCreateProposalClick = () => {
        setNewProposalName(""); // Reset name field when opening dialog
        setCreateProposalDialogOpen(true);
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
                        <Button onClick={handleCreateProposalClick}>
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
                                Are you sure you want to delete the proposal &quot;{selectedProposal?.name}&quot;? This
                                action cannot be undone.
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

                {/* Create Proposal Dialog */}
                <Dialog open={createProposalDialogOpen} onOpenChange={setCreateProposalDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Proposal</DialogTitle>
                            <DialogDescription>
                                Enter a name for your new proposal. You can add more details later.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="proposal-name" className="text-right">
                                    Name
                                </Label>
                                <Input
                                    id="proposal-name"
                                    value={newProposalName}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProposalName(e.target.value)}
                                    className="col-span-3"
                                    placeholder="Proposal Name"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button onClick={onConfirmCreateProposal} disabled={isPending || !newProposalName.trim()}>
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>Create & Edit</>
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

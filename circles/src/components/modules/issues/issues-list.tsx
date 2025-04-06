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
import { Circle, IssueDisplay, IssueStage } from "@/models/models"; // Use Issue types
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
import { deleteIssueAction } from "@/app/circles/[handle]/issues/actions"; // Use issue delete action
import { UserPicture } from "../members/user-picture";
import { motion } from "framer-motion";
import { isAuthorized } from "@/lib/auth/client-auth"; // Added client-side auth check
import { features } from "@/lib/data/constants"; // Added constants import
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useAtom } from "jotai"; // Added jotai import
import { userAtom } from "@/lib/data/atoms"; // Added userAtom import
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // For assignee tooltip

// Define Permissions type based on what IssuesModule passes
type IssuePermissions = {
    canModerate: boolean;
    canReview: boolean;
    canAssign: boolean;
    canResolve: boolean;
    canComment: boolean;
};

interface IssuesListProps {
    issues: IssueDisplay[];
    circle: Circle;
    permissions: IssuePermissions; // Use the defined type
    // currentUserDid prop removed
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
const getStageInfo = (stage: IssueStage) => {
    switch (stage) {
        case "review":
            return { color: "bg-yellow-200 text-yellow-800", icon: Clock, text: "Review" };
        case "open":
            return { color: "bg-blue-200 text-blue-800", icon: Play, text: "Open" }; // Using Play icon for Open
        case "inProgress":
            return { color: "bg-orange-200 text-orange-800", icon: Loader2, text: "In Progress" }; // Using Loader2 for In Progress
        case "resolved":
            return { color: "bg-green-200 text-green-800", icon: CheckCircle, text: "Resolved" };
        default:
            return { color: "bg-gray-200 text-gray-800", icon: Clock, text: "Unknown" };
    }
};

const IssuesList: React.FC<IssuesListProps> = ({ issues, circle, permissions }) => {
    // Removed currentUserDid from props
    const data = React.useMemo(() => issues, [issues]);
    const [user] = useAtom(userAtom); // Get user from atom
    const [sorting, setSorting] = React.useState<SortingState>([{ id: "createdAt", desc: true }]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [deleteIssueDialogOpen, setDeleteIssueDialogOpen] = useState<boolean>(false);
    const [selectedIssue, setSelectedIssue] = useState<IssueDisplay | null>(null);
    const [isPending, startTransition] = useTransition();
    const isCompact = useIsCompact();
    const router = useRouter();
    const { toast } = useToast();
    const [stageFilter, setStageFilter] = useState<IssueStage | "all">("all");
    // Add assignee filter state if needed later
    // const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

    const columns = React.useMemo<ColumnDef<IssueDisplay>[]>(
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
                    const issue = info.row.original;
                    return (
                        <Link
                            href={`/circles/${circle.handle}/issues/${issue._id}`}
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
                    const stage = info.getValue() as IssueStage;
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
                                            // TODO: Implement opening user profile preview/page
                                            e.stopPropagation();
                                            console.log("Open assignee profile:", assignee.handle);
                                            // openAuthor(assignee); // Adapt or create this function
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
                accessorKey: "author", // Assuming 'author' is populated in IssueDisplay
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
                                            // TODO: Implement opening user profile preview/page
                                            e.stopPropagation();
                                            console.log("Open author profile:", author.handle);
                                            // openAuthor(author); // Adapt or create this function
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

    const onConfirmDeleteIssue = async () => {
        if (!selectedIssue) return;

        startTransition(async () => {
            const result = await deleteIssueAction(circle.handle!, selectedIssue._id as string);

            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh(); // Refresh data
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete issue",
                    variant: "destructive",
                });
            }
            setDeleteIssueDialogOpen(false);
            setSelectedIssue(null);
        });
    };

    const handleRowClick = (issue: IssueDisplay) => {
        // For now, always navigate to detail page
        router.push(`/circles/${circle.handle}/issues/${issue._id}`);
        // TODO: Implement side panel preview later if desired
    };

    // Check create permission for the button using the user object
    const canCreateIssue = isAuthorized(user, circle, features.issues.create);

    return (
        <TooltipProvider>
            <div className="flex flex-1 flex-row justify-center">
                <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                    <div className="flex w-full flex-row items-center gap-2">
                        <div className="flex flex-1 flex-col">
                            <Input
                                placeholder="Search issues by title..."
                                value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
                                onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
                            />
                        </div>
                        {canCreateIssue && (
                            <Button asChild>
                                <Link href={`/circles/${circle.handle}/issues/create`}>
                                    <Plus className="mr-2 h-4 w-4" /> Create Issue
                                </Link>
                            </Button>
                        )}
                        <Select
                            value={stageFilter}
                            onValueChange={(value) => setStageFilter(value as IssueStage | "all")}
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
                                        const issue = row.original;
                                        const isAuthor = user?.did === issue.createdBy; // Check against user object's DID
                                        // Determine if edit/delete should be shown
                                        const canEdit =
                                            (isAuthor && issue.stage === "review") || permissions.canModerate;
                                        const canDelete = isAuthor || permissions.canModerate;

                                        return (
                                            <motion.tr
                                                key={row.id}
                                                custom={index}
                                                initial="hidden"
                                                animate="visible"
                                                variants={tableRowVariants}
                                                className={`cursor-pointer ${row.getIsSelected() ? "bg-muted" : ""} hover:bg-gray-50`}
                                                onClick={() => handleRowClick(issue)}
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
                                                                                `/circles/${circle.handle}/issues/${issue._id}/edit`,
                                                                            );
                                                                        }}
                                                                        disabled={issue.stage === "resolved"} // Can't edit resolved issues
                                                                    >
                                                                        Edit
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {canDelete && (
                                                                    <DropdownMenuItem
                                                                        className="text-red-600"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedIssue(issue);
                                                                            setDeleteIssueDialogOpen(true);
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
                                            No issues found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <Dialog open={deleteIssueDialogOpen} onOpenChange={setDeleteIssueDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Delete Issue</DialogTitle>
                                <DialogDescription>
                                    Are you sure you want to delete the issue &quot;{selectedIssue?.title}&quot;? This
                                    action cannot be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button variant="destructive" onClick={onConfirmDeleteIssue} disabled={isPending}>
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

export default IssuesList;

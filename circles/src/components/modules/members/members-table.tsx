"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
    ColumnDef,
    ColumnFiltersState,
    FilterFn,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, Content, ContentPreviewData, MemberDisplay, Page } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal } from "lucide-react";
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
import { features, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { hasHigherAccess, isAuthorized } from "@/lib/auth/client-auth";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { removeMemberAction, updateUserGroupsAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { FormProvider, useForm } from "react-hook-form";
import { MemberUserGroupsGrid } from "@/components/forms/dynamic-field";
import InviteButton from "../home/invite-button";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { UserPicture } from "./user-picture";
import { motion } from "framer-motion";
import CircleHeader from "../circles/circle-header";
import { ListFilter } from "@/components/utils/list-filter";
import { useRouter } from "next/navigation";
import Indicators from "@/components/utils/indicators";
import { updateQueryParam } from "@/lib/utils/helpers-client";

interface MemberTableProps {
    members: MemberDisplay[];
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
}

export const multiSelectFilter: FilterFn<MemberDisplay> = (
    row: Row<MemberDisplay>,
    columnId: string,
    filterValue: any,
    addMeta: (meta: any) => void,
): boolean => {
    let userGroups = row.getValue<string[]>(columnId);
    return userGroups?.includes(filterValue);
};

const SortIcon = ({ sortDir }: { sortDir: string | boolean }) => {
    if (!sortDir) return null;

    if (sortDir === "asc") {
        return <ArrowUp className="ml-2 h-4 w-4" />;
    } else {
        return <ArrowDown className="ml-2 h-4 w-4" />;
    }
};

const ThreeColumnLayout = ({ children }: { children: React.ReactNode }) => {
    return <div className="grid grid-cols-3 gap-2">{children}</div>;
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

const MemberTable: React.FC<MemberTableProps> = ({ circle, members, page, isDefaultCircle }) => {
    const data = React.useMemo(() => members, [members]);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [user, setUser] = useAtom(userAtom);
    const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState<boolean>(false);
    const [editUserGroupsDialogOpen, setEditUserGroupsDialogOpen] = useState<boolean>(false);
    const [selectedMember, setSelectedMember] = useState<MemberDisplay | null>(null);
    const [isPending, startTransition] = useTransition();
    const [selectedUserGroups, setSelectedUserGroups] = useState<string[]>([]);
    const isCompact = useIsCompact();
    const router = useRouter();
    const isUser = circle.circleType === "user";
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);

    // if user is allowed to edit settings show edit button
    const canEditUserGroups =
        isAuthorized(user, circle, features.edit_lower_user_groups) ||
        isAuthorized(user, circle, features.edit_same_level_user_groups);
    const canRemoveUser =
        isAuthorized(user, circle, features.remove_lower_members) ||
        isAuthorized(user, circle, features.remove_same_level_members);
    const canEditSameLevelUserGroups = isAuthorized(user, circle, features.edit_same_level_user_groups);
    const canRemoveSameLevelUser = isAuthorized(user, circle, features.remove_same_level_members);
    const canEdit = canEditUserGroups || canRemoveUser;

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.MemberTable.1");
        }
    }, []);

    const { toast } = useToast();

    const methods = useForm({
        defaultValues: {
            memberUserGroups: {},
        },
    });

    const columns = React.useMemo<ColumnDef<MemberDisplay>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Follower
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => {
                    let picture = info.row.original.picture?.url;
                    let metrics = info.row.original.metrics;
                    let memberName = info.getValue() as string;
                    return (
                        <div className="flex items-center gap-2">
                            <UserPicture name={memberName} picture={picture} />
                            <span className="ml-2 font-bold">{memberName}</span>
                            {metrics && (
                                <Indicators metrics={metrics} className="shadow-none" content={info.row.original} />
                            )}
                        </div>
                    );
                },
            },
            {
                accessorKey: "joinedAt",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Followed At
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => new Date(info.getValue() as Date).toLocaleDateString(),
            },
            {
                accessorKey: "userGroups",
                header: "User Groups",
                cell: (info) => {
                    let userGroups = info.getValue() as string[];
                    return userGroups
                        .map((group) => circle.userGroups?.find((x) => x.handle === group)?.title)
                        .join(", ");
                },
                filterFn: multiSelectFilter,
            },
        ],
        [circle.userGroups, isUser],
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
                joinedAt: !isCompact,
                userGroups: !isCompact,
            },
        },
    });

    const onConfirmRemoveMember = async () => {
        if (!selectedMember) {
            return;
        }

        startTransition(async () => {
            // call server action to remove user from circle
            let result = await removeMemberAction(selectedMember, circle, page);
            if (result.success) {
                toast({
                    icon: "success",
                    title: "Member Removed",
                    description: `${selectedMember.name} has been removed from the circle`,
                });
            } else {
                toast({
                    icon: "error",
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                });
            }

            setRemoveMemberDialogOpen(false);
        });
    };

    const onConfirmEditUserGroups = async (data: any) => {
        if (!selectedMember) {
            return;
        }

        startTransition(async () => {
            let result = await updateUserGroupsAction(
                selectedMember,
                circle,
                data.memberUserGroups[selectedMember.userDid],
                page,
            );
            if (result.success) {
                toast({
                    icon: "success",
                    title: "User Groups Updated",
                    description: `${selectedMember.name}'s user groups have been updated`,
                });
            } else {
                toast({
                    icon: "error",
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                });
            }

            setEditUserGroupsDialogOpen(false);
        });
    };

    const onOpenEditUserGroupsDialog = (member: MemberDisplay) => {
        setSelectedMember(member);
        setSelectedUserGroups(member.userGroups ?? []);
        setEditUserGroupsDialogOpen(true);
    };

    const handleRowClick = (member: MemberDisplay) => {
        if (isCompact) {
            router.push(`/circle/${member.handle}`);
            return;
        }

        let contentPreviewData: ContentPreviewData = {
            type: "member",
            content: member,
        };
        setContentPreview((x) =>
            x?.content === member && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const handleFilterChange = (filter: string) => {
        updateQueryParam(router, "sort", filter);
    };

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <div className="flex w-full flex-row items-center gap-2">
                    <div className="flex flex-1 flex-col">
                        <Input
                            placeholder="Search follower..."
                            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                        />
                    </div>
                    <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                    <Select
                        value={(table.getColumn("userGroups")?.getFilterValue() as string) ?? ""}
                        onValueChange={(value) => {
                            if (value === "everyone") {
                                table.getColumn("userGroups")?.setFilterValue("");
                            } else {
                                table.getColumn("userGroups")?.setFilterValue(value);
                            }
                        }}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Everyone" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="everyone">Everyone</SelectItem>
                            {circle.userGroups?.map((group) => (
                                <SelectItem key={group.handle} value={group.handle}>
                                    {group.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <ListFilter onFilterChange={handleFilterChange} />

                <div className="mt-3 overflow-hidden rounded-[15px] shadow-lg">
                    <Table className="overflow-hidden">
                        <TableHeader className=" bg-white">
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
                                    const member = row.original;
                                    const canEditUserGroupRow =
                                        canEditUserGroups &&
                                        hasHigherAccess(user, member, circle, canEditSameLevelUserGroups);
                                    const canRemoveUserRow =
                                        canRemoveUser && hasHigherAccess(user, member, circle, canRemoveSameLevelUser);
                                    const isActive =
                                        (contentPreview?.content as MemberDisplay)?.userDid === member.userDid;

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
                                            // style={{
                                            //     clipPath: "xywh(0 0 100% 100% round 1em)",
                                            // }}
                                            onClick={() => handleRowClick(member)}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                            <TableCell className="w-[40px]">
                                                {(canEditUserGroupRow || canRemoveUserRow) && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            {canEditUserGroupRow && (
                                                                <DropdownMenuItem
                                                                    onClick={() => onOpenEditUserGroupsDialog(member)}
                                                                >
                                                                    Edit User Groups
                                                                </DropdownMenuItem>
                                                            )}
                                                            {canRemoveUserRow && (
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSelectedMember(member);
                                                                        setRemoveMemberDialogOpen(true);
                                                                    }}
                                                                >
                                                                    Remove User
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
                                    <TableCell
                                        colSpan={columns.length + (canEdit ? 1 : 0)}
                                        className="h-24 text-center"
                                    >
                                        No followers.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <Dialog open={removeMemberDialogOpen} onOpenChange={setRemoveMemberDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Are you sure?</DialogTitle>
                            <DialogDescription>
                                Do you want to remove the user <b>{selectedMember?.name}</b> from the circle?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={onConfirmRemoveMember} disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Removing...
                                    </>
                                ) : (
                                    <>Remove</>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <Dialog open={editUserGroupsDialogOpen} onOpenChange={setEditUserGroupsDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit User Groups</DialogTitle>
                            <DialogDescription>Edit user groups for {selectedMember?.name}.</DialogDescription>
                        </DialogHeader>
                        <FormProvider {...methods}>
                            <form onSubmit={methods.handleSubmit(onConfirmEditUserGroups)}>
                                <MemberUserGroupsGrid
                                    currentUser={user}
                                    members={selectedMember ? [selectedMember] : []}
                                    control={methods.control}
                                    circle={circle}
                                />
                                <DialogFooter className="pt-4">
                                    <DialogClose asChild>
                                        <Button variant="outline">Cancel</Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={isPending}>
                                        {isPending ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>Save</>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </FormProvider>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default MemberTable;

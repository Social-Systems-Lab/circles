"use client";

import React, { forwardRef, useState, useTransition } from "react";
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
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, Feature, MemberDisplay, User, UserPrivate } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, MoreHorizontal } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { features, maxAccessLevel } from "@/lib/data/constants";
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
import { removeMemberAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";

interface MemberTableProps {
    members: MemberDisplay[];
    circle: Circle;
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

export const UserPicture = ({ name, picture }: { name: string; picture: string }) => {
    var getInitials = () => {
        var names = name.split(" "),
            initials = names[0].substring(0, 1).toUpperCase();

        if (names.length > 1) {
            initials += names[names.length - 1].substring(0, 1).toUpperCase();
        }
        return initials;
    };

    return (
        <Avatar>
            <AvatarImage src={picture} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
        </Avatar>
    );
};

const SortIcon = ({ sortDir }: { sortDir: string | boolean }) => {
    if (!sortDir) return null;

    if (sortDir === "asc") {
        return <ArrowUp className="ml-2 h-4 w-4" />;
    } else {
        return <ArrowDown className="ml-2 h-4 w-4" />;
    }
};

const MemberTable: React.FC<MemberTableProps> = ({ circle, members }) => {
    const data = React.useMemo(() => members, [members]);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [user, setUser] = useAtom(userAtom);
    const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState<boolean>(false);
    const [editUserGroupsDialogOpen, setEditUserGroupsDialogOpen] = useState<boolean>(false);
    const [selectedMember, setSelectedMember] = useState<MemberDisplay | null>(null);
    const [isPending, startTransition] = useTransition();

    // if user is allowed to edit settings show edit button
    const canEditUserGroups = isAuthorized(user, circle, features.edit_lower_user_groups);
    const canRemoveUser = isAuthorized(user, circle, features.remove_lower_members);
    const canEdit = canEditUserGroups || canRemoveUser;

    const { toast } = useToast();

    const columns = React.useMemo<ColumnDef<MemberDisplay>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Member
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => {
                    let picture = info.row.original.picture;
                    let memberName = info.getValue() as string;
                    return (
                        <div className="flex items-center gap-2">
                            <UserPicture name={memberName} picture={picture} />
                            <span className="ml-2 font-bold">{memberName}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: "joinedAt",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Joined At
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
        [circle.userGroups],
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
                joinedAt: true,
                userGroups: true,
            },
        },
    });

    const onConfirmRemoveMember = async () => {
        if (!selectedMember) {
            return;
        }

        // call server action to remove user from circle
        let result = await removeMemberAction(selectedMember, circle);
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
        console.log(result);
    };

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex flex-row gap-2">
                <Input
                    placeholder="Search member..."
                    value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                    onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                />
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
            <Table className="mt-1">
                <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
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
                <TableBody>
                    {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => {
                            const member = row.original;
                            const canEditRow = canEdit && hasHigherAccess(user, member, circle);

                            return (
                                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                    <TableCell className="w-[40px]">
                                        {canEditRow && (
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
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            setSelectedMember(member);
                                                            setEditUserGroupsDialogOpen(true);
                                                        }}
                                                    >
                                                        Edit User Groups
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            setSelectedMember(member);
                                                            setRemoveMemberDialogOpen(true);
                                                        }}
                                                    >
                                                        Remove User
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={columns.length + (canEdit ? 1 : 0)} className="h-24 text-center">
                                No members.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
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
                        <DialogDescription>Edit user groups.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button disabled={isPending}>
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
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default MemberTable;

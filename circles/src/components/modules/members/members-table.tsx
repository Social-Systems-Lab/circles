"use client";

import React, { useState } from "react";
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberDisplay } from "@/models/models";

interface MemberTableProps {
    members: MemberDisplay[];
}

const MemberTable: React.FC<MemberTableProps> = ({ members }) => {
    const data = React.useMemo(() => members, [members]);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

    const columns = React.useMemo<ColumnDef<MemberDisplay>[]>(
        () => [
            {
                accessorKey: "name",
                header: "Member",
                cell: (info) => info.getValue(),
            },
            {
                accessorKey: "joinedAt",
                header: "Joined At",
                cell: (info) => new Date(info.getValue() as Date).toLocaleDateString(),
            },
            {
                accessorKey: "userGroups",
                header: "User Groups",
                cell: (info) => (info.getValue() as string[]).join(", "),
            },
        ],
        [],
    );

    const table = useReactTable({
        data: data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        state: {
            sorting,
            columnFilters,
        },
    });

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex flex-row gap-2">
                <Input
                    placeholder="Search member..."
                    // value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                    // onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                />
                <Select
                // value={(table.getColumn("userGroups")?.getFilterValue() as string) ?? ""}
                // onValueChange={(value) => table.getColumn("userGroups")?.setFilterValue(value)}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Everyone" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="everyone">Everyone</SelectItem>
                        <SelectItem value="admin">Admins</SelectItem>
                        <SelectItem value="moderator">Moderators</SelectItem>
                        <SelectItem value="member">Members</SelectItem>
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
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center">
                                No members.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default MemberTable;

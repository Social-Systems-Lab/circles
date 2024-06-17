"use client";

import React, { useState } from "react";
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
import { Circle, MemberDisplay } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

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
    console.log("Filtering: ", row, columnId, filterValue);

    let userGroups = row.getValue<string[]>(columnId);
    console.log("User groups: ", userGroups);
    console.log("User groups includes", filterValue, userGroups?.includes(filterValue));
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

const MemberTable: React.FC<MemberTableProps> = ({ circle, members }) => {
    const data = React.useMemo(() => members, [members]);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

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
                cell: (info) => info.getValue(),
            },
            {
                accessorKey: "joinedAt",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Joined At
                            <SortIcon sortDir={column.getIsSorted()} />
                            {/* <ArrowUpDown className="ml-2 h-4 w-4" /> */}
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
        },
    });

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
                        table.getColumn("userGroups")?.setFilterValue(value);
                        if (value === "everyone") {
                            table.getColumn("userGroups")?.setFilterValue("");
                        } else {
                            console.log("Setting filter value: ", value);
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

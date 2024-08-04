"use client";

import React, { forwardRef, useEffect, useState, useTransition } from "react";
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
import { Circle, Feature, MemberDisplay, Page, User, UserPrivate } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, MoreHorizontal, Plus, UserPlus } from "lucide-react";
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
import { getMemberAccessLevel, hasHigherAccess, isAuthorized } from "@/lib/auth/client-auth";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { removeSubCircleAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { FormProvider, useForm } from "react-hook-form";
import { MemberUserGroupsGrid } from "@/components/forms/dynamic-field";
import InviteButton from "../home/invite-button";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { CirclePicture } from "./circle-picture";
import DynamicForm from "@/components/forms/dynamic-form";

interface InviteButtonProps {
    circle: Circle;
    isDefaultCircle: boolean;
}

const CreateCircleButton: React.FC<InviteButtonProps> = ({ circle, isDefaultCircle }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const isCompact = useIsCompact();

    useEffect(() => {
        console.log("CreateCircleButton", circle);
    }, [circle]);

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={isCompact ? "ghost" : "outline"}
                    className={isCompact ? "h-[32px] w-[32px] p-0" : "gap-2"}
                >
                    <Plus className="h-4 w-4" />
                    {isCompact ? "" : "Create Circle"}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DynamicForm
                    formSchemaId="create-circle-form"
                    initialFormData={{ parentCircleId: circle._id }}
                    maxWidth="100%"
                />
            </DialogContent>
        </Dialog>
    );
};

interface CirclesTableProps {
    circles: Circle[];
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
}

export const multiSelectFilter: FilterFn<Circle> = (
    row: Row<Circle>,
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

const CirclesTable: React.FC<CirclesTableProps> = ({ circle, circles, page, isDefaultCircle }) => {
    const data = React.useMemo(() => circles, [circles]);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [user, setUser] = useAtom(userAtom);
    const isCompact = useIsCompact();
    const canCreateSubcircle = isAuthorized(user, circle, features.create_subcircle);

    const { toast } = useToast();

    const columns = React.useMemo<ColumnDef<Circle>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Circle
                            <SortIcon sortDir={column.getIsSorted()} />
                        </Button>
                    );
                },
                cell: (info) => {
                    let picture = info.row.original.picture?.url;
                    let circleName = info.getValue() as string;
                    return (
                        <div className="flex items-center gap-2">
                            <CirclePicture name={circleName} picture={picture} />
                            <span className="ml-2 font-bold">{circleName}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: "createdAt",
                header: ({ column }) => {
                    return (
                        <Button variant="ghost" onClick={() => column.toggleSorting()}>
                            Created At
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
                createdAt: true,
            },
        },
    });

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="ml-2 mr-2 mt-4 flex max-w-[1000px] flex-1 flex-col">
                <div className="flex w-full flex-row items-center gap-2">
                    <div className="flex flex-1 flex-col">
                        <Input
                            placeholder="Search circle..."
                            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                        />
                    </div>
                    {/* <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} /> */}
                    {canCreateSubcircle && <CreateCircleButton circle={circle} isDefaultCircle={isDefaultCircle} />}
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
                                return (
                                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                        <TableCell />
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length + 2} className="h-24 text-center">
                                    No circles.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default CirclesTable;

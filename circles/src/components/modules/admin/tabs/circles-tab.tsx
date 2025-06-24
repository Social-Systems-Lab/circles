"use client";
import React from "react";
import { Circle } from "@/models/models";
import { DataTable } from "../../../ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";

const CirclesTab = ({ circles }: { circles: Circle[] }) => {
    const columns: ColumnDef<Circle>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => {
                return (
                    <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                        Name
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const circle = row.original;
                return (
                    <div className="flex items-center space-x-2">
                        <Avatar>
                            <AvatarImage src={circle.picture?.url} />
                            <AvatarFallback>{circle.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <Link href={`/circles/${circle.handle}`}>{circle.name}</Link>
                    </div>
                );
            },
        },
        {
            accessorKey: "handle",
            header: "Handle",
        },
        {
            accessorKey: "members",
            header: "Members",
        },
        {
            accessorKey: "subscription.status",
            header: "Subscription",
            cell: ({ row }) => {
                const circle = row.original;
                return circle.subscription?.status ?? "Inactive";
            },
        },
    ];

    return (
        <div>
            <h2 className="mb-4 text-2xl font-bold">Circles</h2>
            <DataTable columns={columns} data={circles} />
        </div>
    );
};

export default CirclesTab;

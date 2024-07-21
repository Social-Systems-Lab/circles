"use client";

import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Circle, MembershipRequest, Page } from "@/models/models";

interface RejectedRequestsTableProps {
    circle: Circle;
    page: Page;
    requests: MembershipRequest[];
}

const RejectedRequestsTable: React.FC<RejectedRequestsTableProps> = ({ circle, page, requests }) => {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rejected At</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center">
                            No rejected requests
                        </TableCell>
                    </TableRow>
                )}

                {requests.map((request) => (
                    <TableRow key={request.id}>
                        <TableCell>{request.name}</TableCell>
                        <TableCell>{request.email}</TableCell>
                        <TableCell>{new Date(request.rejectedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                            <Button variant="outline">Reconsider</Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default RejectedRequestsTable;

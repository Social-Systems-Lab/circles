"use client";

import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Circle, MembershipRequest } from "@/models/models"; // Removed Page import

interface RejectedRequestsTableProps {
    circle: Circle;
    requests: MembershipRequest[];
}

const RejectedRequestsTable: React.FC<RejectedRequestsTableProps> = ({ circle, /* page, */ requests }) => {
    // Commented out page destructuring
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rejected At</TableHead>
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
                    <TableRow key={request._id}>
                        <TableCell>{request.name}</TableCell>
                        <TableCell>{request.email}</TableCell>
                        <TableCell>{new Date(request.rejectedAt!).toLocaleDateString()}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default RejectedRequestsTable;

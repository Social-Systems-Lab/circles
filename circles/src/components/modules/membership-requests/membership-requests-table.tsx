"use client";

import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Circle, MembershipRequest, Page } from "@/models/models";

interface MembershipRequestsTableProps {
    circle: Circle;
    page: Page;
    requests: MembershipRequest[];
}

const MembershipRequestsTable: React.FC<MembershipRequestsTableProps> = ({ circle, page, requests }) => {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center">
                            No pending requests
                        </TableCell>
                    </TableRow>
                )}

                {requests.map((request) => (
                    <TableRow key={request.id}>
                        <TableCell>{request.name}</TableCell>
                        <TableCell>{request.email}</TableCell>
                        <TableCell>{new Date(request.requestedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                            <Button variant="outline" className="mr-2">
                                Approve
                            </Button>
                            <Button variant="outline">Reject</Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default MembershipRequestsTable;

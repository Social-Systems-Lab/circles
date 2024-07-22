"use client";

import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Circle, MembershipRequest, Page } from "@/models/models";
import { useToast } from "@/components/ui/use-toast";
import { approveMembershipRequestAction, rejectMembershipRequestAction } from "./actions";
import { Loader2 } from "lucide-react";

interface MembershipRequestsTableProps {
    circle: Circle;
    page: Page;
    requests: MembershipRequest[];
}

const MembershipRequestsTable: React.FC<MembershipRequestsTableProps> = ({ circle, page, requests }) => {
    const { toast } = useToast();
    const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});

    const handleApprove = async (requestId: string) => {
        setLoadingStates((prev) => ({ ...prev, [requestId]: true }));
        const result = await approveMembershipRequestAction(requestId, circle, page);
        setLoadingStates((prev) => ({ ...prev, [requestId]: false }));

        if (result.success) {
            toast({
                title: "Request Approved",
                description: result.message,
            });
        } else {
            toast({
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

    const handleReject = async (requestId: string) => {
        setLoadingStates((prev) => ({ ...prev, [requestId]: true }));
        const result = await rejectMembershipRequestAction(requestId, circle, page);
        setLoadingStates((prev) => ({ ...prev, [requestId]: false }));

        if (result.success) {
            toast({
                title: "Request Rejected",
                description: result.message,
            });
        } else {
            toast({
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

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
                    <TableRow key={request._id}>
                        <TableCell>{request.name}</TableCell>
                        <TableCell>{request.email}</TableCell>
                        <TableCell>{new Date(request.requestedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                            <Button
                                variant="outline"
                                className="mr-2"
                                onClick={() => handleApprove(request._id!)}
                                disabled={loadingStates[request._id!]}
                            >
                                {loadingStates[request._id!] ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    "Approve"
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => handleReject(request._id!)}
                                disabled={loadingStates[request._id!]}
                            >
                                {loadingStates[request._id!] ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    "Reject"
                                )}
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default MembershipRequestsTable;

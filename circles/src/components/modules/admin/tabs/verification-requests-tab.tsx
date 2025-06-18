"use client";

import { useEffect, useState } from "react";
import {
    getVerificationRequests,
    approveVerificationRequest,
    rejectVerificationRequest,
} from "@/components/modules/admin/actions";
import { VerificationRequest } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";

export default function VerificationRequestsTab() {
    const [requests, setRequests] = useState<VerificationRequest[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const fetchRequests = async () => {
            const fetchedRequests = await getVerificationRequests();
            setRequests(fetchedRequests);
        };
        fetchRequests();
    }, []);

    const handleApprove = async (id: string) => {
        await approveVerificationRequest(id);
        setRequests(requests.filter((req) => req._id !== id));
        toast({
            title: "Request approved",
        });
    };

    const handleReject = async (id: string) => {
        await rejectVerificationRequest(id);
        setRequests(requests.filter((req) => req._id !== id));
        toast({
            title: "Request rejected",
        });
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.map((request) => (
                    <TableRow key={request._id}>
                        <TableCell>
                            <Link href={`/circles/${request.userDid}`} target="_blank">
                                {request.userDid}
                            </Link>
                        </TableCell>
                        <TableCell>{new Date(request.requestedAt).toLocaleString()}</TableCell>
                        <TableCell>
                            <Button onClick={() => handleApprove(request._id)}>Approve</Button>
                            <Button variant="destructive" onClick={() => handleReject(request._id)}>
                                Reject
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

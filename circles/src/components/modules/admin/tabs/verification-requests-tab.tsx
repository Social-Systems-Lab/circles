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
import { UserPicture } from "../../members/user-picture";
import { useSetAtom } from "jotai";
import { contentPreviewAtom } from "@/lib/data/atoms";
import { getUserByDidAction } from "@/components/modules/admin/actions";

type VerificationRequestWithUser = VerificationRequest & {
    user: {
        name: string;
        picture: {
            url: string;
        };
        email: string;
    };
};

export default function VerificationRequestsTab() {
    const [requests, setRequests] = useState<VerificationRequestWithUser[]>([]);
    const { toast } = useToast();
    const setContentPreview = useSetAtom(contentPreviewAtom);

    useEffect(() => {
        const fetchRequests = async () => {
            const fetchedRequests = await getVerificationRequests();
            setRequests(fetchedRequests as VerificationRequestWithUser[]);
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

    const handlePreview = async (did: string) => {
        const user = await getUserByDidAction(did);
        setContentPreview({ type: "user", content: user });
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.map((request) => (
                    <TableRow
                        key={request._id}
                        onClick={() => handlePreview(request.userDid)}
                        className="cursor-pointer"
                    >
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <UserPicture name={request.user.name} picture={request.user.picture.url} />
                                <Link href={`/circles/${request.userDid}`} target="_blank">
                                    {request.user.name}
                                </Link>
                            </div>
                        </TableCell>
                        <TableCell>{request.user.email}</TableCell>
                        <TableCell>{new Date(request.requestedAt).toLocaleString()}</TableCell>
                        <TableCell className="space-x-2">
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

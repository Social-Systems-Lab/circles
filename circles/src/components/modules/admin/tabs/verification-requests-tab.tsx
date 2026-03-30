"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
    approveVerificationRequestAction,
    getVerificationRequestDetailAction,
    getVerificationRequestsAction,
    rejectVerificationRequestAction,
    requestMoreVerificationInfoAction,
} from "@/components/modules/admin/verification-actions";
import { UserPicture } from "../../members/user-picture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type VerificationQueueItem = Awaited<ReturnType<typeof getVerificationRequestsAction>>[number];
type VerificationRequestDetail = NonNullable<Awaited<ReturnType<typeof getVerificationRequestDetailAction>>>;

const STATUS_LABELS: Record<string, string> = {
    submitted: "Submitted",
    awaiting_admin: "Awaiting admin review",
    awaiting_applicant: "Awaiting applicant reply",
    approved: "Approved",
    rejected: "Rejected",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    submitted: "secondary",
    awaiting_admin: "secondary",
    awaiting_applicant: "default",
    approved: "default",
    rejected: "destructive",
};

const formatDate = (value?: string | null) => {
    if (!value) {
        return "-";
    }

    return new Date(value).toLocaleString();
};

function AttachmentList({
    attachments,
}: {
    attachments: Array<{ url: string; fileName?: string; originalName?: string }>;
}) {
    if (!attachments.length) {
        return null;
    }

    return (
        <div className="mt-3 space-y-2">
            {attachments.map((attachment) => {
                const label = attachment.originalName || attachment.fileName || attachment.url;
                const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(label);

                if (isImage) {
                    return (
                        <a
                            key={attachment.url}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-md border"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={attachment.url} alt={label} className="max-h-64 w-full object-contain bg-slate-50" />
                        </a>
                    );
                }

                return (
                    <a
                        key={attachment.url}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                        {label}
                    </a>
                );
            })}
        </div>
    );
}

export default function VerificationRequestsTab() {
    const [requests, setRequests] = useState<VerificationQueueItem[]>([]);
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [detail, setDetail] = useState<VerificationRequestDetail | null>(null);
    const [clarificationBody, setClarificationBody] = useState("");
    const [rejectionReason, setRejectionReason] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const loadRequests = useCallback(async (preferredRequestId?: string | null) => {
        setIsLoading(true);
        try {
            const nextRequests = await getVerificationRequestsAction();
            setRequests(nextRequests);

            if (!nextRequests.length) {
                setSelectedRequestId(null);
                setDetail(null);
                return;
            }

            const nextSelectedId =
                preferredRequestId && nextRequests.some((item) => item.request.id === preferredRequestId)
                    ? preferredRequestId
                    : nextRequests[0].request.id;
            setSelectedRequestId(nextSelectedId);
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Could not load verification requests.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    const loadDetail = useCallback(async (requestId: string) => {
        try {
            const nextDetail = await getVerificationRequestDetailAction(requestId);
            if (!nextDetail) {
                setDetail(null);
                return;
            }
            setDetail(nextDetail);
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Could not load request detail.",
                variant: "destructive",
            });
        }
    }, [toast]);

    useEffect(() => {
        void loadRequests();
    }, [loadRequests]);

    useEffect(() => {
        if (!selectedRequestId) {
            setDetail(null);
            return;
        }

        void loadDetail(selectedRequestId);
    }, [loadDetail, selectedRequestId]);

    const runAction = (action: () => Promise<{ success: boolean; message: string }>, onSuccess?: () => Promise<void> | void) => {
        startTransition(async () => {
            const result = await action();
            toast({
                title: result.message,
                variant: result.success ? "default" : "destructive",
            });

            if (!result.success) {
                return;
            }

            await onSuccess?.();
        });
    };

    const handleRequestMoreInfo = () => {
        if (!selectedRequestId) {
            return;
        }

        runAction(
            () => requestMoreVerificationInfoAction(selectedRequestId, clarificationBody),
            async () => {
                setClarificationBody("");
                await loadRequests(selectedRequestId);
                await loadDetail(selectedRequestId);
            },
        );
    };

    const handleApprove = () => {
        if (!selectedRequestId) {
            return;
        }

        runAction(
            () => approveVerificationRequestAction(selectedRequestId),
            async () => {
                await loadRequests();
            },
        );
    };

    const handleReject = () => {
        if (!selectedRequestId) {
            return;
        }

        runAction(
            () => rejectVerificationRequestAction(selectedRequestId, rejectionReason),
            async () => {
                setRejectionReason("");
                await loadRequests();
            },
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Active queue</CardTitle>
                    <CardDescription>
                        Requests stay here until they are approved or rejected. Clarifications are handled in a
                        dedicated verification thread, not a DM or chat room.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-sm text-muted-foreground">Loading verification requests...</div>
                    ) : requests.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No active verification requests.</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    <TableHead>Updated</TableHead>
                                    <TableHead className="text-right">Open</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((item) => (
                                    <TableRow
                                        key={item.request.id}
                                        className={selectedRequestId === item.request.id ? "bg-slate-50" : undefined}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <UserPicture
                                                    name={item.applicant.name}
                                                    picture={item.applicant.picture?.url}
                                                />
                                                <div>
                                                    <div className="font-medium">{item.applicant.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {item.applicant.email || item.applicant.handle}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={STATUS_VARIANTS[item.request.status] ?? "outline"}>
                                                {STATUS_LABELS[item.request.status] ?? item.request.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{formatDate(item.request.submittedAt)}</TableCell>
                                        <TableCell>{formatDate(item.request.updatedAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedRequestId(item.request.id)}
                                            >
                                                Open
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {detail ? (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                                <CardTitle className="text-lg">{detail.applicant.name}</CardTitle>
                                <CardDescription>
                                    {detail.applicant.handle ? (
                                        <>
                                            <Link
                                                href={`/circles/${detail.applicant.handle}`}
                                                target="_blank"
                                                className="underline"
                                            >
                                                @{detail.applicant.handle}
                                            </Link>
                                            {" · "}
                                        </>
                                    ) : null}
                                    {detail.applicant.email || "No email"}
                                </CardDescription>
                            </div>
                            <Badge variant={STATUS_VARIANTS[detail.request.status] ?? "outline"}>
                                {STATUS_LABELS[detail.request.status] ?? detail.request.status}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                            <div>
                                <div className="font-medium">Submitted</div>
                                <div className="text-muted-foreground">{formatDate(detail.request.submittedAt)}</div>
                            </div>
                            <div>
                                <div className="font-medium">Last updated</div>
                                <div className="text-muted-foreground">{formatDate(detail.request.updatedAt)}</div>
                            </div>
                        </div>

                        {detail.request.decisionReason ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="font-medium">Decision note</div>
                                <p className="mt-1 whitespace-pre-wrap">{detail.request.decisionReason}</p>
                            </div>
                        ) : null}

                        <div className="space-y-4">
                            {detail.messages.length ? (
                                detail.messages.map((message) => (
                                    <div key={message.id} className="rounded-lg border p-4">
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="font-medium">
                                                {message.senderRole === "admin"
                                                    ? `${message.senderName} (admin)`
                                                    : `${message.senderName} (applicant)`}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatDate(message.createdAt)}
                                            </div>
                                        </div>
                                        <p className="mt-3 whitespace-pre-wrap text-sm">{message.body || "Attachment only"}</p>
                                        <AttachmentList attachments={message.attachments} />
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                    No clarification messages yet.
                                </div>
                            )}
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <div className="space-y-3 rounded-lg border p-4">
                                <div>
                                    <div className="font-medium">Request more info</div>
                                    <p className="text-sm text-muted-foreground">
                                        Ask the applicant for clarification. Their next reply will move the request back
                                        into the admin queue.
                                    </p>
                                </div>
                                <Textarea
                                    value={clarificationBody}
                                    onChange={(event) => setClarificationBody(event.target.value)}
                                    rows={5}
                                    placeholder="Explain what the applicant still needs to provide..."
                                />
                                <Button
                                    onClick={handleRequestMoreInfo}
                                    disabled={isPending || !clarificationBody.trim()}
                                >
                                    {isPending ? "Sending..." : "Send request"}
                                </Button>
                            </div>

                            <div className="space-y-4 rounded-lg border p-4">
                                <div>
                                    <div className="font-medium">Decision</div>
                                    <p className="text-sm text-muted-foreground">
                                        Approve the account now, or reject it with a reason that the applicant can see.
                                    </p>
                                </div>
                                <Textarea
                                    value={rejectionReason}
                                    onChange={(event) => setRejectionReason(event.target.value)}
                                    rows={5}
                                    placeholder="Required if rejecting..."
                                />
                                <div className="flex flex-wrap gap-3">
                                    <Button onClick={handleApprove} disabled={isPending}>
                                        {isPending ? "Working..." : "Approve"}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleReject}
                                        disabled={isPending || !rejectionReason.trim()}
                                    >
                                        {isPending ? "Working..." : "Reject"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : requests.length ? (
                <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                        Select a request from the queue to review the thread.
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}

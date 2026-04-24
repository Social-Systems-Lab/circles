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
import { VerificationThreadMessageList } from "@/components/modules/verification/verification-thread-message-list";
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

const REQUEST_TYPE_LABELS: Record<string, string> = {
    profile: "Profile",
    independent_circle: "Independent circle",
};

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
                                    <TableHead>Type</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead>Submitter</TableHead>
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
                                            <Badge variant="outline">
                                                {REQUEST_TYPE_LABELS[item.request.requestType] ?? item.request.requestType}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {item.targetCircle ? (
                                                <div>
                                                    <div className="font-medium">{item.targetCircle.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {item.targetCircle.handle ? `@${item.targetCircle.handle}` : item.targetCircle.id}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-sm text-muted-foreground">Profile account</div>
                                            )}
                                        </TableCell>
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
                                <CardTitle className="text-lg">
                                    {detail.request.requestType === "independent_circle"
                                        ? detail.targetCircle?.name || "Independent circle request"
                                        : detail.applicant.name}
                                </CardTitle>
                                <CardDescription>
                                    <span className="font-medium text-foreground">
                                        {REQUEST_TYPE_LABELS[detail.request.requestType] ?? detail.request.requestType}
                                    </span>
                                    {" · "}
                                    Submitted by{" "}
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
                                    {detail.targetCircle?.handle ? (
                                        <>
                                            {" · "}
                                            <Link
                                                href={`/circles/${detail.targetCircle.handle}`}
                                                target="_blank"
                                                className="underline"
                                            >
                                                View circle
                                            </Link>
                                        </>
                                    ) : null}
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
                            {detail.request.requestType === "independent_circle" ? (
                                <>
                                    <div>
                                        <div className="font-medium">Circle</div>
                                        <div className="text-muted-foreground">
                                            {detail.targetCircle?.name || "Unknown circle"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium">Current workflow state</div>
                                        <div className="text-muted-foreground">
                                            {STATUS_LABELS[detail.request.status] ?? detail.request.status}
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {detail.request.requestType === "independent_circle" && detail.targetCircle?.organizationClaimReview ? (
                            <div className="space-y-3 rounded-lg border p-4 text-sm">
                                <div className="font-medium">Organization claim</div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <div className="text-muted-foreground">Organization</div>
                                        <div>{detail.targetCircle.organizationClaimReview.organizationName || "Unknown"}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Official email</div>
                                        <div>{detail.targetCircle.organizationClaimReview.officialEmail || "Not provided"}</div>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <div className="text-muted-foreground">Website</div>
                                        {detail.targetCircle.organizationClaimReview.websiteUrl ? (
                                            <a
                                                href={detail.targetCircle.organizationClaimReview.websiteUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="underline"
                                            >
                                                {detail.targetCircle.organizationClaimReview.websiteUrl}
                                            </a>
                                        ) : (
                                            <div>Not provided</div>
                                        )}
                                    </div>
                                </div>
                                {detail.targetCircle.organizationClaimReview.websiteDomain &&
                                detail.targetCircle.organizationClaimReview.emailDomain ? (
                                    <div
                                        className={
                                            detail.targetCircle.organizationClaimReview.domainsAlign
                                                ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900"
                                                : "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
                                        }
                                    >
                                        {detail.targetCircle.organizationClaimReview.domainsAlign
                                            ? "Website and official email domains appear to align."
                                            : `Website domain ${detail.targetCircle.organizationClaimReview.websiteDomain} does not appear to align with email domain ${detail.targetCircle.organizationClaimReview.emailDomain}.`}
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                                        Domain comparison is unavailable because the website URL or official email is incomplete.
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {detail.request.decisionReason ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="font-medium">Decision note</div>
                                <p className="mt-1 whitespace-pre-wrap">{detail.request.decisionReason}</p>
                            </div>
                        ) : null}

                        <div className="space-y-4">
                            <VerificationThreadMessageList
                                messages={detail.messages}
                                viewerRole="admin"
                                applicantPictureUrl={detail.applicant.picture?.url}
                                emptyMessage={
                                    detail.request.requestType === "profile"
                                        ? "No clarification messages yet."
                                        : "No clarification messages yet. Use the request-more-info action if this circle needs more detail before approval."
                                }
                            />
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <div className="space-y-3 rounded-lg border p-4">
                                <div>
                                    <div className="font-medium">Request more info</div>
                                    <p className="text-sm text-muted-foreground">
                                        {detail.request.requestType === "profile"
                                            ? "Ask the applicant for clarification. Their next reply will move the request back into the admin queue."
                                            : "Ask the circle owner for clarification. Their next reply will move the request back into the admin queue."}
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
                                        {detail.request.requestType === "profile"
                                            ? "Approve the account now, or reject it with a reason that the applicant can see."
                                            : "Approve to publish this circle. Reject to keep it non-public and return it to draft."}
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
                                        {isPending
                                            ? "Working..."
                                            : detail.request.requestType === "profile"
                                              ? "Approve"
                                              : "Approve and publish"}
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

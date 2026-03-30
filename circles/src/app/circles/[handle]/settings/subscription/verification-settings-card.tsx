"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { VerifyAccountButton } from "@/components/modules/auth/verify-account-button";
import {
    getApplicantVerificationThreadAction,
    replyToVerificationThreadAction,
} from "@/components/modules/auth/verification-thread-actions";

type ApplicantVerificationThread = Awaited<ReturnType<typeof getApplicantVerificationThreadAction>>;

const STATUS_LABELS: Record<string, string> = {
    submitted: "Submitted",
    awaiting_admin: "Awaiting admin review",
    awaiting_applicant: "More info requested",
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
        return null;
    }

    return new Date(value).toLocaleString();
};

const MessageAttachments = ({
    attachments,
}: {
    attachments: Array<{ url: string; fileName?: string; originalName?: string }>;
}) => {
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
};

export function VerificationSettingsCard() {
    const [thread, setThread] = useState<ApplicantVerificationThread | null>(null);
    const [body, setBody] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const loadThread = useCallback(async () => {
        setIsLoading(true);
        try {
            const nextThread = await getApplicantVerificationThreadAction();
            setThread(nextThread);
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Could not load verification status.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void loadThread();
    }, [loadThread]);

    const handleReply = () => {
        if (!thread?.request?.id) {
            return;
        }

        startTransition(async () => {
            const formData = new FormData();
            formData.append("requestId", thread.request.id);
            formData.append("body", body);
            files.forEach((file) => formData.append("attachments", file));

            const result = await replyToVerificationThreadAction(formData);
            toast({
                title: result.message,
                variant: result.success ? "default" : "destructive",
            });

            if (!result.success) {
                return;
            }

            setBody("");
            setFiles([]);
            setFileInputKey((current) => current + 1);
            await loadThread();
        });
    };

    if (isLoading) {
        return (
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="text-xl">Verification</CardTitle>
                    <CardDescription>Loading verification status...</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const request = thread?.request;
    const status = request?.status ?? (thread?.isVerified ? "approved" : null);
    const canReply = Boolean(thread?.canReply && request?.id);

    return (
        <Card className="mb-8">
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="text-xl">Verification</CardTitle>
                        <CardDescription>
                            This is your dedicated verification thread with platform admins. It does not create a DM or
                            chat room.
                        </CardDescription>
                    </div>
                    {status ? (
                        <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>{STATUS_LABELS[status] ?? status}</Badge>
                    ) : (
                        <Badge variant="outline">Not submitted</Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {!request ? (
                    <div className="space-y-3 rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">
                            Submit a verification request to start a dedicated review thread with admins.
                        </p>
                        <VerifyAccountButton onStatusChange={loadThread} />
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                            <div>
                                <div className="font-medium">Submitted</div>
                                <div className="text-muted-foreground">{formatDate(request.submittedAt)}</div>
                            </div>
                            <div>
                                <div className="font-medium">Last updated</div>
                                <div className="text-muted-foreground">{formatDate(request.updatedAt)}</div>
                            </div>
                        </div>

                        {request.decisionReason ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="font-medium">Decision note</div>
                                <p className="mt-1 whitespace-pre-wrap">{request.decisionReason}</p>
                            </div>
                        ) : null}

                        <div className="space-y-4">
                            {thread?.messages.length ? (
                                thread.messages.map((message) => (
                                    <div key={message.id} className="rounded-lg border p-4">
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="font-medium">
                                                {message.senderRole === "admin" ? "Admin" : "You"}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatDate(message.createdAt)}
                                            </div>
                                        </div>
                                        <p className="mt-3 whitespace-pre-wrap text-sm">{message.body || "Attachment only"}</p>
                                        <MessageAttachments attachments={message.attachments} />
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                    No clarification messages yet. Admin updates will appear here.
                                </div>
                            )}
                        </div>

                        {canReply ? (
                            <div className="space-y-3 rounded-lg border p-4">
                                <div>
                                    <div className="font-medium">Reply</div>
                                    <p className="text-sm text-muted-foreground">
                                        Add the requested details or upload supporting material.
                                    </p>
                                </div>
                                <Textarea
                                    value={body}
                                    onChange={(event) => setBody(event.target.value)}
                                    placeholder="Write your reply for the verification team..."
                                    rows={5}
                                />
                                <input
                                    key={fileInputKey}
                                    type="file"
                                    multiple
                                    onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                                />
                                {files.length ? (
                                    <div className="text-sm text-muted-foreground">
                                        {files.map((file) => file.name).join(", ")}
                                    </div>
                                ) : null}
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        onClick={handleReply}
                                        disabled={isPending || (!body.trim() && files.length === 0)}
                                    >
                                        {isPending ? "Sending..." : "Send reply"}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                <div>
                                    {status === "approved" || thread?.isVerified ? (
                                        <>
                                            Your verification has been approved. You can continue from your{" "}
                                            <Link href="/" className="underline">
                                                account home
                                            </Link>
                                            .
                                        </>
                                    ) : status === "rejected" ? (
                                        "This verification request is closed. You can submit a new request when you are ready."
                                    ) : (
                                        "Replies are currently locked until an admin asks for more information."
                                    )}
                                </div>
                                {status === "rejected" ? <VerifyAccountButton onStatusChange={loadThread} /> : null}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
    getIndependentCircleVerificationThreadAction,
    replyToIndependentCircleVerificationThreadAction,
} from "./actions";

type CircleVerificationThread = Awaited<ReturnType<typeof getIndependentCircleVerificationThreadAction>>;

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

export function CircleVerificationThreadCard({
    circleId,
}: {
    circleId: string;
}) {
    const [thread, setThread] = useState<CircleVerificationThread | null>(null);
    const [body, setBody] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const loadThread = useCallback(async () => {
        setIsLoading(true);
        try {
            const nextThread = await getIndependentCircleVerificationThreadAction(circleId);
            setThread(nextThread);
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Could not load verification thread.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [circleId, toast]);

    useEffect(() => {
        void loadThread();
    }, [loadThread]);

    const handleReply = () => {
        if (!thread?.request?.id) {
            return;
        }

        startTransition(async () => {
            const formData = new FormData();
            formData.append("circleId", circleId);
            formData.append("requestId", thread.request.id);
            formData.append("body", body);
            files.forEach((file) => formData.append("attachments", file));

            const result = await replyToIndependentCircleVerificationThreadAction(formData);
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

    if (isLoading || !thread?.request) {
        return null;
    }

    const request = thread.request;
    const status = request.status;
    const canReply = Boolean(thread.canReply && request.id);

    return (
        <Card className="mb-6">
            <CardHeader className="space-y-4 pb-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                        <CardTitle className="text-xl font-semibold tracking-tight">Verification thread</CardTitle>
                        <CardDescription className="max-w-2xl text-sm leading-6">
                            This is the review thread for this circle verification request. Messages stay attached to
                            the verification request and do not create a DM or chat room.
                        </CardDescription>
                    </div>
                    <div className="flex w-fit flex-col items-start gap-1 rounded-lg border px-3 py-2 sm:items-end">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
                        <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>{STATUS_LABELS[status] ?? status}</Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-5 text-sm sm:grid-cols-2">
                    <div>
                        <div className="font-medium text-foreground">Submitted</div>
                        <div className="mt-1 text-muted-foreground">{formatDate(request.submittedAt)}</div>
                    </div>
                    <div>
                        <div className="font-medium text-foreground">Last updated</div>
                        <div className="mt-1 text-muted-foreground">{formatDate(request.updatedAt)}</div>
                    </div>
                </div>

                {request.decisionReason ? (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                        <div className="font-medium">Decision note</div>
                        <p className="whitespace-pre-wrap">{request.decisionReason}</p>
                    </div>
                ) : null}

                <div className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold">Thread</h2>
                        <p className="text-sm text-muted-foreground">
                            Admin clarification requests and your replies will appear here in order.
                        </p>
                    </div>
                    {thread.messages.length ? (
                        thread.messages.map((message) => (
                            <div key={message.id} className="rounded-lg border p-5">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="font-medium">
                                        {message.senderRole === "admin" ? "Admin" : "You"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</div>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm">{message.body || "Attachment only"}</p>
                                <MessageAttachments attachments={message.attachments} />
                            </div>
                        ))
                    ) : (
                        <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                            No clarification messages yet. Admin updates will appear here.
                        </div>
                    )}
                </div>

                {canReply ? (
                    <div className="space-y-4 rounded-lg border bg-muted/20 p-5">
                        <div className="space-y-1">
                            <div className="font-medium">Reply</div>
                            <p className="text-sm text-muted-foreground">
                                Add the requested details or upload supporting material for this circle.
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
                            <div className="text-sm text-muted-foreground">{files.map((file) => file.name).join(", ")}</div>
                        ) : null}
                        <div className="flex flex-wrap gap-3">
                            <Button onClick={handleReply} disabled={isPending || (!body.trim() && files.length === 0)}>
                                {isPending ? "Sending..." : "Send reply"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                        <div>
                            {status === "approved"
                                ? "This circle has been approved and is now public."
                                : status === "rejected"
                                  ? "This verification request is closed. You can submit a new request when you are ready."
                                  : "Replies are currently locked until an admin asks for more information."}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

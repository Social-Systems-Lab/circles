"use client";

import { UserPicture } from "@/components/modules/members/user-picture";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VerificationThreadMessage = {
    id: string;
    senderRole: "admin" | "applicant";
    senderName: string;
    senderPictureUrl?: string | null;
    body?: string;
    createdAt?: string | null;
    attachments: Array<{ url: string; fileName?: string; originalName?: string }>;
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
                            className="block overflow-hidden rounded-xl border bg-white"
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
                        className="block rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    >
                        {label}
                    </a>
                );
            })}
        </div>
    );
};

export function VerificationThreadMessageList({
    messages,
    viewerRole,
    applicantPictureUrl,
    emptyMessage,
}: {
    messages: VerificationThreadMessage[];
    viewerRole: "admin" | "applicant";
    applicantPictureUrl?: string;
    emptyMessage: string;
}) {
    if (!messages.length) {
        return <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{emptyMessage}</div>;
    }

    return (
        <div className="space-y-4">
            {messages.map((message) => {
                const isOwnMessage = message.senderRole === viewerRole;
                const roleLabel =
                    message.senderRole === "admin" ? "Admin" : isOwnMessage ? "You" : "Applicant";

                return (
                    <div
                        key={message.id}
                        className={cn("flex gap-3", isOwnMessage ? "flex-row-reverse" : "flex-row")}
                    >
                        <div className="pt-1">
                            <UserPicture
                                name={message.senderName}
                                picture={message.senderPictureUrl ?? (message.senderRole === "applicant" ? applicantPictureUrl : undefined)}
                                size="40px"
                            />
                        </div>
                        <div className={cn("max-w-3xl flex-1 space-y-2", isOwnMessage ? "items-end text-right" : "")}>
                            <div
                                className={cn(
                                    "flex flex-wrap items-center gap-2 text-sm",
                                    isOwnMessage ? "justify-end" : "justify-start",
                                )}
                            >
                                <span className="font-medium text-foreground">{message.senderName}</span>
                                <Badge variant={message.senderRole === "admin" ? "outline" : "secondary"}>
                                    {roleLabel}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</span>
                            </div>
                            <div
                                className={cn(
                                    "rounded-2xl border px-4 py-3 shadow-sm",
                                    message.senderRole === "admin"
                                        ? "border-slate-200 bg-white"
                                        : "border-slate-300 bg-slate-50",
                                )}
                            >
                                <p className="whitespace-pre-wrap text-sm text-foreground">
                                    {message.body || "Attachment only"}
                                </p>
                                <MessageAttachments attachments={message.attachments} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

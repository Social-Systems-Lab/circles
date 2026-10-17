"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { mapOpenAtom } from "@/lib/data/atoms";
import { useIsCompact } from "@/components/utils/use-is-compact";
import {
    createSecretCircleInvitation,
    listPendingSecretCircleInvitations,
    resolveSecretInvitationRecipient,
    revokeSecretCircleInvitation,
} from "./secret-invitation-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PendingSecretCircleInvitation } from "@/lib/data/secret-circle-invitations";

interface InviteButtonProps {
    circle: Pick<Circle, "_id" | "handle" | "circleType" | "visibility">;
    renderCompact?: boolean;
    canInviteSecret?: boolean;
}

export const getInviteButtonMode = (
    circle: Pick<Circle, "visibility">,
    canInviteSecret = false,
): "copy-link" | "secret" | null =>
    circle.visibility === "secret" ? (canInviteSecret ? "secret" : null) : "copy-link";

const InviteButton: React.FC<InviteButtonProps> = ({ circle, renderCompact, canInviteSecret = false }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const isCompact = useIsCompact();
    const { toast } = useToast();
    const isUser = circle?.circleType === "user";
    const compact = isCompact || renderCompact;
    const mode = getInviteButtonMode(circle, canInviteSecret);
    const [reference, setReference] = useState("");
    const [candidate, setCandidate] = useState<{ name?: string; handle?: string; picture?: { url: string } } | null>(
        null,
    );
    const [isPending, setIsPending] = useState(false);
    const [pendingInvitations, setPendingInvitations] = useState<PendingSecretCircleInvitation[]>([]);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [managementError, setManagementError] = useState("");

    const loadPendingInvitations = useCallback(async () => {
        if (mode !== "secret" || !circle._id) return;
        try {
            const result = await listPendingSecretCircleInvitations(circle._id.toString());
            if (result.ok) {
                setPendingInvitations(result.invitations);
                setManagementError("");
            } else {
                setPendingInvitations([]);
                setManagementError("Unable to load pending invitations.");
            }
        } catch {
            setPendingInvitations([]);
            setManagementError("Unable to load pending invitations.");
        }
    }, [circle._id, mode]);

    useEffect(() => {
        if (isDialogOpen && mode === "secret") void loadPendingInvitations();
    }, [isDialogOpen, loadPendingInvitations, mode]);

    const getCirclePagePath = (
        circle: Pick<Circle, "handle" | "circleType">,
        pageHandle: string,
        absolutePath: boolean,
    ): string => {
        if (typeof window === "undefined") {
            return "";
        }

        let rootPath = absolutePath ? window.location.origin : "";
        return `${rootPath}/circles/${circle.handle}${pageHandle ? `/${pageHandle}` : ""}`;
    };

    const inviteLink = getCirclePagePath(circle, "", true);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            toast({
                title: "Link copied",
                description: "Invite link has been copied to clipboard",
            });
        } catch (err) {
            toast({
                title: "Failed to copy",
                description: "An error occurred while copying the link",
                variant: "destructive",
            });
        }
    };

    // if (isCompact) {
    //     return null;
    // }

    if (mode === null) {
        return null;
    }

    const resolveRecipient = async () => {
        if (!circle._id) return;
        setIsPending(true);
        try {
            const result = await resolveSecretInvitationRecipient(circle._id.toString(), reference);
            setCandidate(result);
            if (result) return;
            toast({
                title: "Unable to invite",
                description: "Check the profile and try again.",
                variant: "destructive",
            });
        } catch {
            toast({
                title: "Unable to invite",
                description: "Check the profile and try again.",
                variant: "destructive",
            });
        } finally {
            setIsPending(false);
        }
    };

    const sendSecretInvitation = async () => {
        if (!circle._id) return;
        setIsPending(true);
        try {
            const result = await createSecretCircleInvitation(circle._id.toString(), reference);
            if (!result.ok) {
                toast({
                    title: "Unable to invite",
                    description: "The private invitation could not be created.",
                    variant: "destructive",
                });
                return;
            }
            toast({
                title: result.alreadyInvited ? "Already invited" : "Invitation sent",
                description: result.alreadyInvited
                    ? "A pending private invitation already exists."
                    : "A private invitation was sent.",
            });
            setReference("");
            setCandidate(null);
            await loadPendingInvitations();
        } catch {
            toast({
                title: "Unable to invite",
                description: "The private invitation could not be created.",
                variant: "destructive",
            });
        } finally {
            setIsPending(false);
        }
    };

    const revokeInvitation = async (invitationId: string) => {
        setRevokingId(invitationId);
        setManagementError("");
        try {
            const result = await revokeSecretCircleInvitation(invitationId);
            if (!result.ok) {
                setManagementError("Unable to revoke invitation.");
                return;
            }
            setPendingInvitations((current) => current.filter((item) => item.invitationId !== invitationId));
        } catch {
            setManagementError("Unable to revoke invitation.");
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={compact ? "ghost" : "outline"}
                    className={compact ? "h-[32px] w-[32px] p-0" : "gap-2 rounded-full"}
                >
                    <UserPlus className="h-4 w-4" />
                    {compact ? "" : "Invite"}
                </Button>
            </DialogTrigger>
            <DialogContent
                className="sm:max-w-md"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>
                        {mode === "secret"
                            ? "Invite a Kamooni member"
                            : isUser
                              ? "Invite people to the user"
                              : "Invite people to the circle"}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "secret"
                            ? "Enter an exact @handle, handle, or Kamooni profile URL."
                            : isUser
                              ? "Anyone with this link can request to follow the user."
                              : "Anyone with this link can request to follow the circle."}
                    </DialogDescription>
                </DialogHeader>
                {mode === "secret" ? (
                    <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                            <Input
                                value={reference}
                                onChange={(event) => {
                                    setReference(event.target.value);
                                    setCandidate(null);
                                }}
                                placeholder="@handle"
                            />
                            <Button type="button" onClick={resolveRecipient} disabled={isPending || !reference.trim()}>
                                Find
                            </Button>
                        </div>
                        {candidate && (
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        {candidate.picture?.url && <AvatarImage src={candidate.picture.url} alt="" />}
                                        <AvatarFallback>{candidate.name?.slice(0, 1) || "?"}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium">{candidate.name}</div>
                                        <div className="text-sm text-muted-foreground">@{candidate.handle}</div>
                                    </div>
                                </div>
                                <Button type="button" onClick={sendSecretInvitation} disabled={isPending}>
                                    Send invite
                                </Button>
                            </div>
                        )}
                        <div className="space-y-2 border-t pt-3">
                            <div className="text-sm font-medium">Pending invitations</div>
                            {managementError && <div className="text-sm text-destructive">{managementError}</div>}
                            {pendingInvitations.map((invitation) => (
                                <div
                                    key={invitation.invitationId}
                                    className="flex items-center justify-between gap-3 rounded-md border p-2"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                            {invitation.recipientAvatarUrl && (
                                                <AvatarImage src={invitation.recipientAvatarUrl} alt="" />
                                            )}
                                            <AvatarFallback>
                                                {invitation.recipientName.slice(0, 1) || "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">
                                                {invitation.recipientName}
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                @{invitation.recipientHandle} ·{" "}
                                                {new Date(invitation.invitedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={revokingId === invitation.invitationId}
                                        onClick={() => revokeInvitation(invitation.invitationId)}
                                    >
                                        Revoke
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center space-x-2">
                        <Input className="flex-1" value={inviteLink} readOnly />
                        <Button type="submit" onClick={copyToClipboard}>
                            Copy
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default InviteButton;

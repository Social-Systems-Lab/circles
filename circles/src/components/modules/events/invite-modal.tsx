"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import UserPicker from "@/components/forms/user-picker";
import { useToast } from "@/components/ui/use-toast";
import {
    inviteUsersToEventAction,
    getInvitedUsersAction,
    getEventCircleMemberInviteCandidatesAction,
    resolveExternalEventInviteAction,
    inviteExternalUserToEventAction,
} from "@/app/circles/[handle]/events/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type InviteCandidate = Circle & {
    inviteSources?: ("circle_member" | "contact")[];
    inviteSourceLabel?: string;
};

type Props = {
    circleHandle: string;
    eventId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export default function InviteModal({ circleHandle, eventId, open, onOpenChange }: Props) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [selectedUsers, setSelectedUsers] = useState<InviteCandidate[]>([]);
    const [invitedUsers, setInvitedUsers] = useState<Circle[]>([]);
    const [canBulkInviteCircleMembers, setCanBulkInviteCircleMembers] = useState(false);
    const [circleMemberCount, setCircleMemberCount] = useState(0);
    const [bulkConfirmed, setBulkConfirmed] = useState(false);
    const [isLoadingBulkMembers, setLoadingBulkMembers] = useState(false);
    const [externalInviteInput, setExternalInviteInput] = useState("");
    const [externalInviteError, setExternalInviteError] = useState<string | null>(null);
    const [resolvedExternalUser, setResolvedExternalUser] = useState<InviteCandidate | null>(null);
    const [isResolvingExternalUser, setIsResolvingExternalUser] = useState(false);
    const [isAddingExternalInvite, setIsAddingExternalInvite] = useState(false);

    const invitedDids = useMemo(() => invitedUsers.map((u) => u.did!).filter(Boolean), [invitedUsers]);

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const { users } = await getInvitedUsersAction(circleHandle, eventId);
                setInvitedUsers(users || []);
            } catch (e) {
                console.error("Failed to fetch invited users:", e);
                setInvitedUsers([]);
            }
        })();
    }, [open, circleHandle, eventId]);

    const handleCandidatesLoaded = useCallback(
        (data: { candidates: InviteCandidate[]; canBulkInviteCircleMembers: boolean; circleMemberCount: number }) => {
            setCanBulkInviteCircleMembers(data.canBulkInviteCircleMembers);
            setCircleMemberCount(data.circleMemberCount);
        },
        [],
    );

    const handleSelectAllCircleMembers = async () => {
        if (!bulkConfirmed) return;

        setLoadingBulkMembers(true);
        const result = await getEventCircleMemberInviteCandidatesAction(circleHandle, eventId);
        setLoadingBulkMembers(false);

        if (!result.success) {
            toast({
                title: "Could not load circle members",
                description: result.message,
                variant: "destructive",
            });
            return;
        }

        const selectedByDid = new Map(selectedUsers.map((user) => [user.did, user]));
        for (const member of result.candidates) {
            if (member.did) {
                selectedByDid.set(member.did, member);
            }
        }
        setSelectedUsers(Array.from(selectedByDid.values()));
        setCircleMemberCount(result.count);
    };

    const handleInvite = () => {
        if (selectedUsers.length === 0) {
            toast({ title: "No users selected", variant: "destructive" });
            return;
        }

        startTransition(async () => {
            const userDids = selectedUsers.map((u) => u.did!);
            const result = await inviteUsersToEventAction(circleHandle, eventId, userDids);
            if (result.success) {
                toast({ title: "Invitations sent" });
                onOpenChange(false);
            } else {
                toast({ title: "Error", description: result.message, variant: "destructive" });
            }
        });
    };

    const handleResolveExternalUser = async () => {
        setExternalInviteError(null);
        setResolvedExternalUser(null);
        setIsResolvingExternalUser(true);

        const result = await resolveExternalEventInviteAction(circleHandle, eventId, externalInviteInput);
        setIsResolvingExternalUser(false);

        if (!result.success || !result.user) {
            setExternalInviteError(result.message || "No Kamooni member was found for that profile link or handle.");
            return;
        }

        if (invitedDids.includes(result.user.did!) || selectedUsers.some((user) => user.did === result.user!.did)) {
            setExternalInviteError("This person has already been invited.");
            return;
        }

        setResolvedExternalUser(result.user as InviteCandidate);
    };

    const handleAddExternalInvite = async () => {
        if (!resolvedExternalUser) return;

        setExternalInviteError(null);
        setIsAddingExternalInvite(true);
        const result = await inviteExternalUserToEventAction(circleHandle, eventId, externalInviteInput);
        setIsAddingExternalInvite(false);

        if (!result.success) {
            setExternalInviteError(result.message || "Failed to send invitation");
            return;
        }

        setInvitedUsers((users) => {
            if (users.some((user) => user.did === resolvedExternalUser.did)) {
                return users;
            }
            return [...users, resolvedExternalUser];
        });
        setSelectedUsers((users) => users.filter((user) => user.did !== resolvedExternalUser.did));
        setExternalInviteInput("");
        setResolvedExternalUser(null);
        toast({ title: "Invitation sent" });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Invite Users</DialogTitle>
                </DialogHeader>
                {canBulkInviteCircleMembers && circleMemberCount > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-medium">Invite all circle members</p>
                                <p className="text-xs text-muted-foreground">
                                    Adds {circleMemberCount} eligible circle member
                                    {circleMemberCount === 1 ? "" : "s"} to this invitation batch.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!bulkConfirmed || isLoadingBulkMembers}
                                onClick={handleSelectAllCircleMembers}
                            >
                                {isLoadingBulkMembers ? "Loading..." : "Add all members"}
                            </Button>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                                checked={bulkConfirmed}
                                onCheckedChange={(checked) => setBulkConfirmed(checked === true)}
                            />
                            I understand this will add all eligible circle members to the invite.
                        </label>
                    </div>
                )}
                <UserPicker
                    onSelectionChange={setSelectedUsers}
                    onCandidatesLoaded={handleCandidatesLoaded}
                    initialSelection={selectedUsers}
                    circleHandle={circleHandle}
                    eventId={eventId}
                    excludeDids={invitedDids}
                />
                <div className="mt-4 space-y-3 rounded-md border p-3">
                    <div>
                        <p className="text-sm font-medium">Invite another Kamooni member</p>
                        <p className="text-xs text-muted-foreground">
                            Paste an exact Kamooni profile link or enter an exact @handle.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            value={externalInviteInput}
                            onChange={(event) => {
                                setExternalInviteInput(event.target.value);
                                setExternalInviteError(null);
                                setResolvedExternalUser(null);
                            }}
                            placeholder="https://kamooni.org/circles/example-handle or @example-handle"
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleResolveExternalUser();
                                }
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleResolveExternalUser}
                            disabled={isResolvingExternalUser || externalInviteInput.trim().length === 0}
                        >
                            {isResolvingExternalUser ? "Finding..." : "Find"}
                        </Button>
                    </div>
                    {externalInviteError && <p className="text-sm text-destructive">{externalInviteError}</p>}
                    {resolvedExternalUser && (
                        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={resolvedExternalUser.picture?.url} />
                                    <AvatarFallback>{resolvedExternalUser.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{resolvedExternalUser.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        @{resolvedExternalUser.handle}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleAddExternalInvite}
                                disabled={isAddingExternalInvite}
                            >
                                {isAddingExternalInvite ? "Adding..." : "Add invitation"}
                            </Button>
                        </div>
                    )}
                </div>
                {invitedUsers.length > 0 && (
                    <p
                        className="mt-2 text-xs text-muted-foreground"
                        title={invitedUsers
                            .map((u) => u.name)
                            .filter(Boolean)
                            .join(", ")}
                    >
                        Previously invited:{" "}
                        {(() => {
                            const names = invitedUsers.map((u) => u.name).filter(Boolean);
                            const shown = names.slice(0, 3).join(", ");
                            const remaining = names.length - 3;
                            return remaining > 0 ? `${shown}, and ${remaining} more` : shown;
                        })()}
                    </p>
                )}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleInvite} disabled={isPending}>
                        {isPending ? "Sending..." : "Send Invitations"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

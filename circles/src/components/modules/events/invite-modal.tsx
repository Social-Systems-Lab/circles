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
} from "@/app/circles/[handle]/events/actions";
import { Checkbox } from "@/components/ui/checkbox";

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
        (data: {
            candidates: InviteCandidate[];
            canBulkInviteCircleMembers: boolean;
            circleMemberCount: number;
        }) => {
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

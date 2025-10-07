"use client";

import React, { useState, useTransition, useEffect } from "react";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import UserPicker from "@/components/forms/user-picker";
import { useToast } from "@/components/ui/use-toast";
import { inviteUsersToEventAction, getInvitedUsersAction } from "@/app/circles/[handle]/events/actions";

type Props = {
    circleHandle: string;
    eventId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export default function InviteModal({ circleHandle, eventId, open, onOpenChange }: Props) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [selectedUsers, setSelectedUsers] = useState<Circle[]>([]);
    const [invitedUsers, setInvitedUsers] = useState<Circle[]>([]);

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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite Users</DialogTitle>
                </DialogHeader>
                <UserPicker
                    onSelectionChange={setSelectedUsers}
                    circleHandle={circleHandle}
                    excludeDids={invitedUsers.map((u) => u.did!).filter(Boolean)}
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

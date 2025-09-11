"use client";

import React, { useState, useTransition } from "react";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import UserPicker from "@/components/forms/user-picker";
import { useToast } from "@/components/ui/use-toast";
import { inviteUsersToEventAction } from "@/app/circles/[handle]/events/actions";

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
                <UserPicker onSelectionChange={setSelectedUsers} circleHandle={circleHandle} />
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

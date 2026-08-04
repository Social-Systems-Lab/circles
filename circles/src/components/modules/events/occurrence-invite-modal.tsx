"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Circle } from "@/models/models";
import {
    getEventOccurrenceInviteesAction,
    inviteUsersToEventOccurrenceAction,
} from "@/app/circles/[handle]/events/actions";
import UserPicker from "@/components/forms/user-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type Props = {
    circleHandle: string;
    seriesId: string;
    occurrenceKey: number;
    occurrenceId: string;
    seriesTitle: string;
    occurrenceLabel: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export default function OccurrenceInviteModal(props: Props) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [selectedUsers, setSelectedUsers] = useState<Circle[]>([]);
    const [existingInviteeDids, setExistingInviteeDids] = useState<string[]>([]);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!props.open) return;
        void getEventOccurrenceInviteesAction(props.circleHandle, props.seriesId, props.occurrenceKey).then(
            ({ rows }) => {
                setExistingInviteeDids(
                    rows
                        .filter((row) => row.scope === "occurrence")
                        .map((row) => row.user.did!)
                        .filter(Boolean),
                );
            },
        );
    }, [props.open, props.circleHandle, props.seriesId, props.occurrenceKey]);

    const selectedDids = useMemo(() => selectedUsers.map((user) => user.did!).filter(Boolean), [selectedUsers]);

    const send = () => {
        if (selectedDids.length === 0) {
            toast({ title: "Select at least one person", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await inviteUsersToEventOccurrenceAction(
                props.circleHandle,
                props.seriesId,
                props.occurrenceKey,
                selectedDids,
                message,
            );
            if (!result.success) {
                toast({ title: "Could not send invitations", description: result.message, variant: "destructive" });
                return;
            }
            toast({
                title: result.newlyInvited > 0 ? "Invitations sent" : "No new invitations sent",
                description:
                    result.alreadyInvited || result.skipped
                        ? `${result.alreadyInvited} already invited, ${result.skipped} skipped.`
                        : undefined,
            });
            setSelectedUsers([]);
            setMessage("");
            window.dispatchEvent(new Event("event-occurrence-invitations-updated"));
            props.onOpenChange(false);
        });
    };

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Invite to this meeting</DialogTitle>
                </DialogHeader>
                <div className="rounded-md border bg-muted/30 p-3">
                    <p className="font-medium">{props.seriesTitle}</p>
                    <p className="text-sm text-muted-foreground">{props.occurrenceLabel}</p>
                </div>
                <div className="space-y-2">
                    <label htmlFor="occurrence-invitation-message" className="text-sm font-medium">
                        Invitation message (optional)
                    </label>
                    <Textarea
                        id="occurrence-invitation-message"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        maxLength={500}
                        placeholder="Add a note for this meeting"
                    />
                    <p className="text-right text-xs text-muted-foreground">{message.length}/500</p>
                </div>
                <UserPicker
                    onSelectionChange={setSelectedUsers}
                    initialSelection={selectedUsers}
                    circleHandle={props.circleHandle}
                    eventId={props.occurrenceId}
                    excludeDids={existingInviteeDids}
                />
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={send} disabled={isPending}>
                        {isPending ? "Sending..." : "Send invitations"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

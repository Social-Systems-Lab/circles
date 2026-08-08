"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Circle } from "@/models/models";
import {
    getEventOccurrenceSeriesParticipantCandidatesAction,
    inviteUsersToEventOccurrenceAction,
} from "@/app/circles/[handle]/events/actions";
import { mergeEventOccurrenceInviteCandidates } from "@/lib/event-occurrence-invitation";
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
    const [message, setMessage] = useState("");
    const [isAddingSeriesParticipants, setIsAddingSeriesParticipants] = useState(false);
    const [effectiveStatusByDid, setEffectiveStatusByDid] = useState<
        Record<string, "going" | "interested">
    >({});
    const [seriesParticipantSummary, setSeriesParticipantSummary] = useState<{
        added: number;
        alreadySelected: number;
        existingOccurrenceInviteesSelectedForUpdate: number;
        notAttending: number;
        ineligibleOrUnavailable: number;
    } | null>(null);

    useEffect(() => {
        if (!props.open) return;
        let active = true;
        void getEventOccurrenceSeriesParticipantCandidatesAction(
            props.circleHandle,
            props.seriesId,
            props.occurrenceKey,
        ).then((result) => {
            if (!active || !result.success) return;
            setEffectiveStatusByDid(
                Object.fromEntries(
                    result.candidates.flatMap((candidate) =>
                        candidate.did && candidate.effectiveOccurrenceRsvpStatus
                            ? [[candidate.did, candidate.effectiveOccurrenceRsvpStatus]]
                            : [],
                    ),
                ),
            );
        });
        return () => {
            active = false;
        };
    }, [props.open, props.circleHandle, props.seriesId, props.occurrenceKey]);

    const selectedDids = useMemo(() => selectedUsers.map((user) => user.did!).filter(Boolean), [selectedUsers]);

    const addSeriesParticipants = async () => {
        setIsAddingSeriesParticipants(true);
        const result = await getEventOccurrenceSeriesParticipantCandidatesAction(
            props.circleHandle,
            props.seriesId,
            props.occurrenceKey,
        );
        setIsAddingSeriesParticipants(false);
        if (!result.success) {
            toast({ title: "Could not load series participants", description: result.message, variant: "destructive" });
            return;
        }

        const merged = mergeEventOccurrenceInviteCandidates(selectedUsers, result.candidates);
        const selectedDidSet = new Set(selectedUsers.map((candidate) => candidate.did).filter(Boolean));
        setSeriesParticipantSummary({
            ...result.counts,
            added: merged.length - selectedUsers.length,
            alreadySelected: result.candidates.filter((candidate) => candidate.did && selectedDidSet.has(candidate.did))
                .length,
        });
        setSelectedUsers(merged);
    };

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
                { resendExisting: true },
            );
            if (!result.success) {
                toast({ title: "Could not send invitations", description: result.message, variant: "destructive" });
                return;
            }
            toast({
                title:
                    result.newlyInvited + result.updatedAndResent > 0
                        ? "Invitations and updates sent"
                        : "No invitations sent",
                description: [
                    result.newlyInvited > 0 && `${result.newlyInvited} new`,
                    result.updatedAndResent > 0 && `${result.updatedAndResent} updated`,
                    result.alreadyInvitedNotResent > 0 && `${result.alreadyInvitedNotResent} already invited`,
                    result.skipped > 0 && `${result.skipped} skipped`,
                ]
                    .filter(Boolean)
                    .join(" · ") || undefined,
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
                <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                            Adds people marked Attending or Interested for this meeting. You can review the list before
                            sending.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addSeriesParticipants}
                            disabled={isAddingSeriesParticipants}
                            className="shrink-0"
                        >
                            {isAddingSeriesParticipants ? "Adding..." : "Add attendees & interested"}
                        </Button>
                    </div>
                    {seriesParticipantSummary && (
                        <p className="text-xs text-muted-foreground">
                            {[
                                seriesParticipantSummary.added > 0 && `${seriesParticipantSummary.added} added`,
                                seriesParticipantSummary.alreadySelected > 0 &&
                                    `${seriesParticipantSummary.alreadySelected} already selected`,
                                seriesParticipantSummary.existingOccurrenceInviteesSelectedForUpdate > 0 &&
                                    `${seriesParticipantSummary.existingOccurrenceInviteesSelectedForUpdate} selected for update`,
                                seriesParticipantSummary.notAttending > 0 &&
                                    `${seriesParticipantSummary.notAttending} not attending`,
                                seriesParticipantSummary.ineligibleOrUnavailable > 0 &&
                                    `${seriesParticipantSummary.ineligibleOrUnavailable} unavailable`,
                            ]
                                .filter(Boolean)
                                .join(" · ") || "No eligible series participants to add"}
                        </p>
                    )}
                </div>
                <UserPicker
                    onSelectionChange={setSelectedUsers}
                    initialSelection={selectedUsers}
                    circleHandle={props.circleHandle}
                    eventId={props.occurrenceId}
                    effectiveOccurrenceRsvpStatusByDid={effectiveStatusByDid}
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

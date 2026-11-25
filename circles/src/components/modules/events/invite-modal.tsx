"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { EventInviteCandidateDto } from "@/lib/event-invite-candidate";
import { chunkRecipientDids } from "@/lib/security/recipient-input";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
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
import { GUEST_INVITATIONS_UPDATED, GuestInvitationForm, GuestInviteeRows } from "./guest-invitation-form";
import type { EventGuestInviteeRow, GuestInvitationPreview } from "@/lib/event-guest-invitation";
import type { Event } from "@/models/models";

type InviteCandidate = EventInviteCandidateDto & { profileReference?: string };
type Invitee = Awaited<ReturnType<typeof getInvitedUsersAction>>["users"][number];

const responseLabel = {
    pending: "Awaiting response",
    going: "Attending",
    interested: "Interested",
    cancelled: "Not interested",
} as const;

type Props = {
    circleHandle: string;
    eventId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    event: GuestInvitationPreview & Pick<Event, "recurrence">;
};

export default function InviteModal({ circleHandle, eventId, open, onOpenChange, event }: Props) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [selectedUsers, setSelectedUsers] = useState<InviteCandidate[]>([]);
    const [invitedUsers, setInvitedUsers] = useState<Invitee[]>([]);
    const [guestInvitees, setGuestInvitees] = useState<EventGuestInviteeRow[]>([]);
    const [isLoadingInvitees, setLoadingInvitees] = useState(false);
    const [canBulkInviteCircleMembers, setCanBulkInviteCircleMembers] = useState(false);
    const [circleMemberCount, setCircleMemberCount] = useState(0);
    const [bulkConfirmed, setBulkConfirmed] = useState(false);
    const [isLoadingBulkMembers, setLoadingBulkMembers] = useState(false);
    const [externalInviteInput, setExternalInviteInput] = useState("");
    const [externalInviteError, setExternalInviteError] = useState<string | null>(null);
    const [isResolvingExternalUser, setIsResolvingExternalUser] = useState(false);

    const invitedDids = useMemo(() => invitedUsers.map((user) => user.did), [invitedUsers]);

    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoadingInvitees(true);
        const load = () => {
            void getInvitedUsersAction(circleHandle, eventId, true)
                .then(({ users, guests }) => {
                    if (!active) return;
                    setInvitedUsers(users);
                    setGuestInvitees(guests);
                    setSelectedUsers((selected) =>
                        selected.filter((user) => !users.some((invitee) => invitee.did === user.did)),
                    );
                })
                .catch((error) => console.error("Failed to fetch invited users:", error))
                .finally(() => {
                    if (active) setLoadingInvitees(false);
                });
        };
        load();
        window.addEventListener(GUEST_INVITATIONS_UPDATED, load);
        return () => {
            active = false;
            window.removeEventListener(GUEST_INVITATIONS_UPDATED, load);
        };
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

        setSelectedUsers((selected) => {
            const selectedByDid = new Map(selected.map((user) => [user.did, user]));
            for (const member of result.candidates) {
                if (member.did && !invitedDids.includes(member.did) && !selectedByDid.has(member.did)) {
                    selectedByDid.set(member.did, member);
                }
            }
            return [...selectedByDid.values()];
        });
        setCircleMemberCount(result.count);
    };

    const cannotSend =
        isPending || isLoadingInvitees || isLoadingBulkMembers || isResolvingExternalUser || selectedUsers.length === 0;

    const handleInvite = () => {
        if (cannotSend) return;

        startTransition(async () => {
            let sendError: string | undefined;
            try {
                const memberDids = selectedUsers.filter((user) => !user.profileReference).map((user) => user.did);
                for (const batch of chunkRecipientDids(memberDids)) {
                    const result = await inviteUsersToEventAction(circleHandle, eventId, batch);
                    if (!result.success) {
                        sendError = result.message || "Could not send invitations.";
                        break;
                    }
                }
                for (const user of selectedUsers) {
                    if (sendError) break;
                    if (!user.profileReference) continue;
                    const result = await inviteExternalUserToEventAction(
                        circleHandle,
                        eventId,
                        user.profileReference,
                        user.did,
                    );
                    if (!result.success) sendError = result.message || "Could not send the invitation.";
                }
            } catch {
                sendError = "Could not complete the invitation request.";
            }

            try {
                const result = await getInvitedUsersAction(circleHandle, eventId, true);
                if (!result.success) throw new Error("Could not refresh invitations");
                setInvitedUsers(result.users);
                const invited = new Set(result.users.map((user) => user.did));
                setSelectedUsers((selected) => selected.filter((user) => !invited.has(user.did)));
                const confirmed = selectedUsers.filter((user) => invited.has(user.did)).length;

                if (confirmed === selectedUsers.length && !sendError) {
                    toast({ title: "Invitations sent" });
                } else {
                    toast({
                        title: confirmed > 0 ? "Invitation list updated" : "Could not send invitations",
                        description: sendError || "Some selected members could not be invited.",
                        variant: "destructive",
                    });
                }
            } catch {
                toast({
                    title: "Could not refresh invitations",
                    description: sendError || "Reopen this dialog to check which invitations were sent.",
                    variant: "destructive",
                });
            }
        });
    };

    const handleResolveExternalUser = async () => {
        const reference = externalInviteInput.trim();
        if (!reference || isResolvingExternalUser || isPending) return;

        setExternalInviteError(null);
        setIsResolvingExternalUser(true);
        try {
            const result = await resolveExternalEventInviteAction(circleHandle, eventId, reference);
            const user = result.user;
            if (!result.success || !user) {
                setExternalInviteError(
                    result.message || "No Kamooni member was found for that profile link or handle.",
                );
                return;
            }
            if (invitedDids.includes(user.did)) {
                setExternalInviteError("This person has already been invited.");
                return;
            }

            setSelectedUsers((selected) =>
                selected.some((candidate) => candidate.did === user.did)
                    ? selected
                    : [...selected, { ...user, profileReference: reference, inviteSources: [], inviteSourceLabel: "" }],
            );
            setExternalInviteInput("");
        } catch {
            setExternalInviteError("Could not find the member. Try again.");
        } finally {
            setIsResolvingExternalUser(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Invite members</DialogTitle>
                    <DialogDescription>
                        {event.recurrence
                            ? "Open a specific meeting to invite guests by email."
                            : "Select Kamooni members or invite guests by email."}
                    </DialogDescription>
                </DialogHeader>
                {canBulkInviteCircleMembers && circleMemberCount > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-medium">Add all circle members</p>
                                <p className="text-xs text-muted-foreground">
                                    Adds {circleMemberCount} eligible circle member
                                    {circleMemberCount === 1 ? "" : "s"} to this invitation batch.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!bulkConfirmed || isLoadingBulkMembers || isPending}
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
                <div className="space-y-2 rounded-md border p-3">
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
                            }}
                            disabled={isResolvingExternalUser || isPending}
                            placeholder="Profile link or @handle"
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
                            disabled={isPending || isResolvingExternalUser || externalInviteInput.trim().length === 0}
                        >
                            {isResolvingExternalUser ? "Finding..." : "Find and add"}
                        </Button>
                    </div>
                    {externalInviteError && <p className="text-sm text-destructive">{externalInviteError}</p>}
                </div>
                <DialogFooter className="flex-col gap-2 sm:items-center sm:space-x-0">
                    <p aria-live="polite" className="mr-auto text-sm text-muted-foreground">
                        {selectedUsers.length} selected
                    </p>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">
                            Close
                        </Button>
                    </DialogClose>
                    <Button type="button" onClick={handleInvite} disabled={cannotSend}>
                        {isPending ? "Sending..." : "Send Invitations"}
                    </Button>
                </DialogFooter>
                {!event.recurrence && <GuestInvitationForm circleHandle={circleHandle} eventId={eventId} event={event} />}
                {(invitedUsers.length > 0 || guestInvitees.length > 0) && (
                    <section aria-labelledby="event-invitees-heading" className="space-y-2">
                        <h3 id="event-invitees-heading" className="text-sm font-medium">
                            Previously invited
                        </h3>
                        <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                            {invitedUsers.map((user) => (
                                <li key={user.did} className="flex items-center gap-2 px-2 py-1.5">
                                    <Avatar className="h-7 w-7">
                                        <AvatarImage src={user.picture?.url} alt="" />
                                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
                                    {user.response && (
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {responseLabel[user.response]}
                                        </span>
                                    )}
                                </li>
                            ))}
                            <GuestInviteeRows guests={guestInvitees} />
                        </ul>
                    </section>
                )}
            </DialogContent>
        </Dialog>
    );
}

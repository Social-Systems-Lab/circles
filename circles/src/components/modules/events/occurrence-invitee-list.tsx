"use client";

import { useEffect, useState } from "react";
import type { EventOccurrenceInviteeRow } from "@/app/circles/[handle]/events/actions";
import { getEventOccurrenceInviteesAction } from "@/app/circles/[handle]/events/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GUEST_INVITATIONS_UPDATED, GuestInviteeRows } from "./guest-invitation-form";
import type { EventGuestInviteeRow } from "@/lib/event-guest-invitation";

type Props = { circleHandle: string; seriesId: string; occurrenceKey: number; guestManagement?: boolean };

const responseLabel = {
    pending: "Pending",
    going: "Attending",
    interested: "Interested",
    not_attending: "Not attending",
} as const;

export default function OccurrenceInviteeList({ circleHandle, seriesId, occurrenceKey, guestManagement }: Props) {
    const [rows, setRows] = useState<EventOccurrenceInviteeRow[]>([]);
    const [guests, setGuests] = useState<EventGuestInviteeRow[]>([]);

    useEffect(() => {
        let active = true;
        const load = () => {
            void getEventOccurrenceInviteesAction(circleHandle, seriesId, occurrenceKey).then((result) => {
                if (!active) return;
                setRows(result.rows);
                setGuests(result.guests);
            });
        };
        load();
        window.addEventListener("event-occurrence-invitations-updated", load);
        window.addEventListener(GUEST_INVITATIONS_UPDATED, load);
        return () => {
            active = false;
            window.removeEventListener("event-occurrence-invitations-updated", load);
            window.removeEventListener(GUEST_INVITATIONS_UPDATED, load);
        };
    }, [circleHandle, seriesId, occurrenceKey]);

    const members = guestManagement ? [] : rows;
    const visibleGuests = guestManagement ? guests : guests.filter((guest) => guest.status !== "going");
    if (members.length === 0 && visibleGuests.length === 0) return null;

    return (
        <div className="rounded-md border p-4">
            <div className="mb-3 text-sm font-medium text-muted-foreground">
                {guestManagement ? "Guest invitations" : "Invited"}
            </div>
            <ul className="space-y-3">
                {members.map((row) => (
                    <li key={row.user.did} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <Avatar>
                                <AvatarImage src={row.user.picture?.url} />
                                <AvatarFallback>{row.user.name?.[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="truncate font-semibold">{row.user.name}</p>
                                <p className="truncate text-sm text-muted-foreground">@{row.user.handle}</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant="outline">
                                {row.scope === "occurrence" ? "This meeting" : "Series invite"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{responseLabel[row.response]}</span>
                        </div>
                    </li>
                ))}
                <GuestInviteeRows guests={visibleGuests} />
            </ul>
        </div>
    );
}

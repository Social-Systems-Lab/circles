"use client";

import React, { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInvitedUsersAction } from "@/app/circles/[handle]/events/actions";
import { GUEST_INVITATIONS_UPDATED, GuestInviteeRows } from "./guest-invitation-form";

type Props = {
    userDids: string[];
    circleHandle: string;
    eventId: string;
    canInvite: boolean;
};

export default function InvitedUserList({ userDids, circleHandle, eventId, canInvite }: Props) {
    const [invitees, setInvitees] = useState<Awaited<ReturnType<typeof getInvitedUsersAction>>>({
        success: false,
        users: [],
        guests: [],
    });
    const [loading, setLoading] = useState(true);
    const hasMemberInvitations = Boolean(userDids?.length);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                if (canInvite || hasMemberInvitations) {
                    const result = await getInvitedUsersAction(circleHandle, eventId, canInvite);
                    if (active) setInvitees(result);
                }
            } catch {
                // Keep the current list until a refresh succeeds.
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        window.addEventListener(GUEST_INVITATIONS_UPDATED, load);
        return () => {
            active = false;
            window.removeEventListener(GUEST_INVITATIONS_UPDATED, load);
        };
    }, [hasMemberInvitations, circleHandle, eventId, canInvite]);

    const { users, guests } = invitees;

    if (loading) {
        return <div>Loading invited users...</div>;
    }

    if (users.length === 0 && guests.length === 0) {
        return null;
    }

    return (
        <div className="rounded-md border p-4">
            <div className="mb-2 text-sm text-muted-foreground">Invited</div>
            <ul className="space-y-3">
                {users.map((user) => (
                    <li key={user.did} className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src={user.picture?.url} />
                            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-sm text-muted-foreground">@{user.handle}</p>
                        </div>
                    </li>
                ))}
                <GuestInviteeRows guests={guests} />
            </ul>
        </div>
    );
}

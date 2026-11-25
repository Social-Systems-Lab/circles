"use client";

import React, { useEffect, useState } from "react";
import { Circle } from "@/models/models";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAttendeesWithDetailsAction } from "@/app/circles/[handle]/events/actions";
import { useSetAtom } from "jotai";
import { contentPreviewAtom } from "@/lib/data/atoms";

type Props = {
    circleHandle: string;
    eventId?: string;
    guestNames: string[];
};

export default function AttendeesList({ circleHandle, eventId, guestNames }: Props) {
    const [attendees, setAttendees] = useState<{ user: Circle; message?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const setContentPreview = useSetAtom(contentPreviewAtom);

    useEffect(() => {
        if (!eventId) return;
        let mounted = true;
        const fetchUsers = async () => {
            try {
                const result = await getAttendeesWithDetailsAction(circleHandle, eventId);
                if (mounted) setAttendees(result.attendees || []);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchUsers();
        return () => {
            mounted = false;
        };
    }, [circleHandle, eventId]);

    const members = eventId ? attendees : [];
    if (eventId && loading && guestNames.length === 0) return <div>Loading participants...</div>;
    if (members.length === 0 && guestNames.length === 0) return null;

    return (
        <div className="formatted rounded-md border p-4">
            <div className="mb-2 text-sm text-muted-foreground">Participants</div>
            <div className="space-y-3">
                {members.map(({ user, message }) => (
                    <div
                        key={user.did}
                        onClick={() => setContentPreview({ type: "user", content: user })}
                        className="flex cursor-pointer items-center gap-3 rounded-md p-1 hover:bg-muted/50"
                    >
                        <Avatar>
                            <AvatarImage src={user.picture?.url} />
                            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="mb-0 pb-0 font-semibold" style={{ marginBottom: 0 }}>
                                {user.name}
                            </p>
                            {user.handle ? (
                                <p className="text-sm text-muted-foreground" style={{ marginTop: 0 }}>
                                    @{user.handle}
                                </p>
                            ) : null}
                            {message ? <p className="mt-1 text-sm italic text-muted-foreground">“{message}”</p> : null}
                        </div>
                    </div>
                ))}
                {guestNames.map((name, index) => (
                    <div key={index} className="flex items-center gap-3 p-1">
                        <Avatar>
                            <AvatarFallback>{name[0]}</AvatarFallback>
                        </Avatar>
                        <p className="mb-0 pb-0 font-semibold" style={{ marginBottom: 0 }}>
                            {name}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

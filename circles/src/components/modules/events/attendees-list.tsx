"use client";

import React, { useEffect, useState } from "react";
import { Circle } from "@/models/models";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAttendeesAction } from "@/app/circles/[handle]/events/actions";

type Props = {
    circleHandle: string;
    eventId: string;
};

export default function AttendeesList({ circleHandle, eventId }: Props) {
    const [users, setUsers] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchUsers = async () => {
            try {
                const result = await getAttendeesAction(circleHandle, eventId);
                if (mounted) setUsers(result.users || []);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchUsers();
        return () => {
            mounted = false;
        };
    }, [circleHandle, eventId]);

    if (loading) return <div>Loading participants...</div>;
    if (!users || users.length === 0) return null;

    return (
        <div className="formatted rounded-md border p-4">
            <div className="mb-2 text-sm text-muted-foreground">Participants</div>
            <div className="space-y-3">
                {users.map((user) => (
                    <div key={user.did} className="flex items-center gap-3">
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
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

"use client";

import React, { useState, useEffect } from "react";
import { Circle } from "@/models/models";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInvitedUsersAction } from "@/app/circles/[handle]/events/actions";

type Props = {
    userDids: string[];
    circleHandle: string;
    eventId: string;
};

export default function InvitedUserList({ userDids, circleHandle, eventId }: Props) {
    const [users, setUsers] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            if (userDids && userDids.length > 0) {
                const result = await getInvitedUsersAction(circleHandle, eventId);
                setUsers(result.users);
            }
            setLoading(false);
        };

        fetchUsers();
    }, [userDids, circleHandle, eventId]);

    if (loading) {
        return <div>Loading invited users...</div>;
    }

    if (users.length === 0) {
        return null;
    }

    return (
        <div className="rounded-md border p-4">
            <div className="mb-2 text-sm text-muted-foreground">Invited</div>
            <div className="space-y-3">
                {users.map((user) => (
                    <div key={user.did} className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src={user.picture?.url} />
                            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-sm text-muted-foreground">@{user.handle}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

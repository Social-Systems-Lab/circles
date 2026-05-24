"use client";

import { Circle } from "@/models/models";
import { UserStatusBadge } from "./user-status-badge";

type UserBadgeProps = {
    user: Circle;
};

export default function UserBadge({ user }: UserBadgeProps) {
    return (
        <div className="flex items-center gap-2">
            <span>{user.name}</span>
            <UserStatusBadge user={user} />
        </div>
    );
}

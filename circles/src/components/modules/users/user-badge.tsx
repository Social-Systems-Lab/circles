"use client";

import Image from "next/image";
import { Circle } from "@/models/models";

type UserBadgeProps = {
    user: Circle;
};

export default function UserBadge({ user }: UserBadgeProps) {
    const isMember = user.subscription?.status === "active" || user.manualMember;
    const isVerified = user.isVerified;

    return (
        <div className="flex items-center">
            <span>{user.name}</span>
            {isMember && (
                <Image src="/images/member-badge.png" alt="Member Badge" width={16} height={16} className="ml-1" />
            )}
            {!isMember && isVerified && (
                <Image src="/images/verified-badge.png" alt="Verified Badge" width={16} height={16} className="ml-1" />
            )}
        </div>
    );
}

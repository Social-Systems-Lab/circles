"use client";

import React from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";

interface NeedsCardProps {
    circle: Circle;
    isOwner: boolean;
}

export default function NeedsCard({ circle, isOwner }: NeedsCardProps) {
    const router = useRouter();
    const isUserProfile = circle.circleType === "user";

    if (isUserProfile) {
        return null;
    }

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    if (!isOwner && !circle.needs?.text) {
        return null;
    }

    return (
        <PresenceCard title="What we need help with" isOwner={isOwner} onEdit={onEdit}>
            {circle.needs?.text ? (
                <div>
                    {circle.needs?.text && <RichText content={circle.needs.text} />}
                </div>
            ) : (
                <div className="text-center text-muted-foreground">
                    <p>Ask for help. People want to contribute.</p>
                    <p className="text-sm italic">design polish, venue, copy edit, contacts</p>
                </div>
            )}
        </PresenceCard>
    );
}

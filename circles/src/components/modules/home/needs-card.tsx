"use client";

import React from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import { Badge } from "@/components/ui/badge";
import { getSkillLabelByHandle } from "@/lib/data/skills";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";

interface NeedsCardProps {
    circle: Circle;
    canEdit: boolean;
}

export default function NeedsCard({ circle, canEdit }: NeedsCardProps) {
    const router = useRouter();
    const isUserProfile = circle.circleType === "user";

    if (isUserProfile) {
        return null;
    }

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    const { text, tags = [] } = circle.needs ?? {};
    const hasText = Boolean(text?.trim());
    if (!canEdit && !hasText && !tags.length) {
        return null;
    }

    return (
        <PresenceCard title="What we need help with" canEdit={canEdit} onEdit={onEdit}>
            {hasText && text ? (
                <div>
                    <RichText content={text} />
                </div>
            ) : tags.length ? (
                <div className="flex flex-wrap gap-2">
                    {[...new Set(tags)].map((handle) => (
                        <Badge key={handle}>{getSkillLabelByHandle(handle)}</Badge>
                    ))}
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

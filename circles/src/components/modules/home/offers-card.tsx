"use client";

import React from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import { Badge } from "@/components/ui/badge";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";
import { getSkillLabelByHandle } from "@/lib/data/skills";

interface OffersCardProps {
    circle: Circle;
    canEdit: boolean;
}

export default function OffersCard({ circle, canEdit }: OffersCardProps) {
    const router = useRouter();

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    const { text, skills = [] } = circle.offers ?? {};
    const hasText = Boolean(text?.trim());
    if (!canEdit && !hasText && !skills.length) {
        return null;
    }

    return (
        <PresenceCard
            title={circle.circleType === "user" ? "My offers & skills" : "Our offers & skills"}
            canEdit={canEdit}
            onEdit={onEdit}
        >
            {hasText && text ? (
                <div>
                    <RichText content={text} />
                </div>
            ) : skills.length ? (
                <div className="flex flex-wrap gap-2">
                    {[...new Set(skills)].map((handle) => (
                        <Badge key={handle}>{getSkillLabelByHandle(handle)}</Badge>
                    ))}
                </div>
            ) : (
                <div className="text-center text-muted-foreground">
                    <p>Tell people 3 ways you can help right now.</p>
                    <p className="text-sm italic">facilitation, data viz, grant writing</p>
                </div>
            )}
        </PresenceCard>
    );
}

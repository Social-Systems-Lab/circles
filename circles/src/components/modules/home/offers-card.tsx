"use client";

import React from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import { Badge } from "@/components/ui/badge";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";

interface OffersCardProps {
    circle: Circle;
    isOwner: boolean;
}

export default function OffersCard({ circle, isOwner }: OffersCardProps) {
    const router = useRouter();

    const handleSkillClick = (skill: string) => {
        router.push(`/explore?skills=${skill}`);
    };

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    if (!isOwner && (!circle.offers || !circle.offers.text)) {
        return null;
    }

    return (
        <PresenceCard
            title={circle.circleType === "user" ? "My offers & skills" : "Our offers & skills"}
            isOwner={isOwner}
            onEdit={onEdit}
        >
            {circle.offers?.text ? (
                <div>
                    <RichText content={circle.offers.text} />
                    <div className="mt-4 flex flex-wrap gap-2">
                        {circle.offers.skills?.map((skill) => (
                            <Badge key={skill} onClick={() => handleSkillClick(skill)} className="cursor-pointer">
                                {skill}
                            </Badge>
                        ))}
                    </div>
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

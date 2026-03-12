"use client";

import React from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";

interface OffersCardProps {
    circle: Circle;
    isOwner: boolean;
}

export default function OffersCard({ circle, isOwner }: OffersCardProps) {
    const router = useRouter();

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    if (!isOwner && (!circle.offers || !circle.offers.text)) {
        return null;
    }

    return (
        <PresenceCard
            title={circle.circleType === "user" ? "My offers & skills" : "Why get involved"}
            isOwner={isOwner}
            onEdit={onEdit}
        >
            {circle.offers?.text ? (
                <div>
                    <RichText content={circle.offers.text} />
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

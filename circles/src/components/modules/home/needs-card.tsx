"use client";

import React, { useState } from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";
import { findOrCreateDMRoom } from "./actions";
import { DmChatModal } from "../chat/dm-chat-modal";
import { trackEvent } from "@/app/api/analytics/actions";

interface NeedsCardProps {
    circle: Circle;
    isOwner: boolean;
}

export default function NeedsCard({ circle, isOwner }: NeedsCardProps) {
    const router = useRouter();
    const [showDM, setShowDM] = useState(false);
    const [initialMessage, setInitialMessage] = useState("");

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    const onOfferHelp = async () => {
        trackEvent("offer_to_help_click", { circleId: circle._id });
        const room = await findOrCreateDMRoom(circle);
        if (room) {
            setInitialMessage(`> ${circle.needs?.text}\n\nI can help with: … (timeframe/availability)`);
            setShowDM(true);
        }
    };

    if (!isOwner && (!circle.needs || !circle.needs.text)) {
        return null;
    }

    return (
        <PresenceCard title="What I need help with" isOwner={isOwner} onEdit={onEdit}>
            {circle.needs?.text ? (
                <div>
                    <RichText content={circle.needs.text} />
                    {!isOwner && circle.needs.offerHelpEnabled && (
                        <div className="mt-4">
                            <Button onClick={onOfferHelp}>Offer to help</Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center text-muted-foreground">
                    <p>Ask for help. People want to contribute.</p>
                    <p className="text-sm italic">design polish, venue, copy edit, contacts</p>
                </div>
            )}
            {showDM && (
                <DmChatModal recipient={circle} onClose={() => setShowDM(false)} initialMessage={initialMessage} />
            )}
        </PresenceCard>
    );
}

"use client";

import React, { useState } from "react";
import PresenceCard from "./presence-card";
import { Circle } from "@/models/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import RichText from "../feeds/RichText";
import { useRouter } from "next/navigation";
import { findOrCreateDMRoom } from "./actions";
import { DmChatModal } from "../chat/dm-chat-modal";
import { trackEvent } from "@/app/api/analytics/actions";

interface EngagementCardProps {
    circle: Circle;
    isOwner: boolean;
}

export default function EngagementCard({ circle, isOwner }: EngagementCardProps) {
    const router = useRouter();
    const [showDM, setShowDM] = useState(false);
    const [initialMessage, setInitialMessage] = useState("");

    const handleInterestClick = (interest: string) => {
        router.push(`/explore?interests=${interest}`);
    };

    const onEdit = () => {
        router.push(`/circles/${circle.handle}/settings/presence`);
    };

    const onInvite = async () => {
        trackEvent("invite_to_project_click", { circleId: circle._id });
        const room = await findOrCreateDMRoom(circle);
        if (room) {
            setInitialMessage(`Saw your ‘What I want to engage in’ and think you’d be great for [project name] …`);
            setShowDM(true);
        }
    };

    if (!isOwner && (!circle.engagements || !circle.engagements.text)) {
        return null;
    }

    return (
        <PresenceCard title="What I want to engage in" isOwner={isOwner} onEdit={onEdit}>
            {circle.engagements?.text ? (
                <div>
                    <RichText content={circle.engagements.text} />
                    <div className="mt-4 flex flex-wrap gap-2">
                        {circle.engagements.interests?.map((interest) => (
                            <Badge
                                key={interest}
                                onClick={() => handleInterestClick(interest)}
                                className="cursor-pointer"
                            >
                                {interest}
                            </Badge>
                        ))}
                    </div>
                    {!isOwner && circle.engagements.inviteEnabled && (
                        <div className="mt-4">
                            <Button onClick={onInvite}>Invite to project</Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center text-muted-foreground">
                    <p>What kinds of projects light you up? Be specific.</p>
                </div>
            )}
            {showDM && (
                <DmChatModal recipient={circle} onClose={() => setShowDM(false)} initialMessage={initialMessage} />
            )}
        </PresenceCard>
    );
}

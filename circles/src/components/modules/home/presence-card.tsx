"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { trackEvent } from "@/app/api/analytics/actions";

interface PresenceCardProps {
    title: string;
    isOwner: boolean;
    onEdit: () => void;
    children: React.ReactNode;
}

export default function PresenceCard({ title, isOwner, onEdit, children }: PresenceCardProps) {
    const isCompact = useIsCompact();

    useEffect(() => {
        trackEvent("presence_card_impression", { cardTitle: title });
    }, [title]);

    return (
        <div className={`bg-white p-6 ${isCompact ? "rounded-none" : "rounded-[15px] border-0 shadow-lg"}`}>
            <div className="flex flex-row items-center justify-between">
                <h1 className="my-4">{title}</h1>
                {isOwner && (
                    <Button variant="outline" onClick={onEdit}>
                        Edit
                    </Button>
                )}
            </div>
            <div>{children}</div>
        </div>
    );
}

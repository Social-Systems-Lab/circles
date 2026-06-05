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
        <div className={`bg-white p-6 ${isCompact ? "rounded-none" : "rounded-[18px] border border-black/5 shadow-[0_10px_28px_rgba(15,23,42,0.08)]"}`}>
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

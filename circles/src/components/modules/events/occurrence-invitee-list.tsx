"use client";

import { useEffect, useState } from "react";
import type { EventOccurrenceInviteeRow } from "@/app/circles/[handle]/events/actions";
import { getEventOccurrenceInviteesAction } from "@/app/circles/[handle]/events/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Props = { circleHandle: string; seriesId: string; occurrenceKey: number };

const responseLabel = {
    pending: "Pending",
    going: "Attending",
    interested: "Interested",
    not_attending: "Not attending",
} as const;

export default function OccurrenceInviteeList({ circleHandle, seriesId, occurrenceKey }: Props) {
    const [rows, setRows] = useState<EventOccurrenceInviteeRow[]>([]);

    useEffect(() => {
        const load = () => {
            void getEventOccurrenceInviteesAction(circleHandle, seriesId, occurrenceKey).then((result) =>
                setRows(result.rows),
            );
        };
        load();
        window.addEventListener("event-occurrence-invitations-updated", load);
        return () => window.removeEventListener("event-occurrence-invitations-updated", load);
    }, [circleHandle, seriesId, occurrenceKey]);

    if (rows.length === 0) return null;

    return (
        <div className="rounded-md border p-4">
            <div className="mb-3 text-sm font-medium text-muted-foreground">Invited</div>
            <div className="space-y-3">
                {rows.map((row) => (
                    <div key={row.user.did} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <Avatar>
                                <AvatarImage src={row.user.picture?.url} />
                                <AvatarFallback>{row.user.name?.[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="truncate font-semibold">{row.user.name}</p>
                                <p className="truncate text-sm text-muted-foreground">@{row.user.handle}</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant="outline">
                                {row.scope === "occurrence" ? "This meeting" : "Series invite"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{responseLabel[row.response]}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

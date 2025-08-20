"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { EventDisplay } from "@/models/models";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Clock, MapPin, Users } from "lucide-react";

type Props = {
    circleHandle: string;
    events: EventDisplay[];
};

const monthColorClasses = [
    "bg-red-400", // Jan
    "bg-orange-400", // Feb
    "bg-amber-400", // Mar
    "bg-yellow-400", // Apr
    "bg-lime-400", // May
    "bg-green-400", // Jun
    "bg-emerald-400", // Jul
    "bg-teal-400", // Aug
    "bg-cyan-400", // Sep
    "bg-sky-400", // Oct
    "bg-blue-400", // Nov
    "bg-indigo-400", // Dec
];

function fmtRange(startAt?: Date | string, endAt?: Date | string, allDay?: boolean): string {
    if (!startAt || !endAt) return "";
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (allDay) {
        // Same day vs multi-day
        const sameDay =
            s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
        if (sameDay) {
            return format(s, "EEE, MMM d, yyyy");
        }
        return `${format(s, "EEE, MMM d")} - ${format(e, "EEE, MMM d, yyyy")}`;
    }
    const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
    if (sameDay) {
        return `${format(s, "EEE, MMM d, yyyy • p")} - ${format(e, "p")}`;
    }
    return `${format(s, "EEE, MMM d, yyyy • p")} - ${format(e, "EEE, MMM d, yyyy • p")}`;
}

function locationToString(evt: EventDisplay): string | undefined {
    if (evt.isVirtual) return "Online";
    const loc = evt.location;
    if (!loc) return undefined;
    const parts = [loc.street, loc.city, loc.region, loc.country].filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : undefined;
}

const EventCard: React.FC<{ e: EventDisplay; circleHandle: string }> = ({ e, circleHandle }) => {
    const stage = e.stage;
    const isDraft = stage === "review";
    const isCancelled = stage === "cancelled";
    const attendees = e.attendees ?? 0;

    return (
        <Link href={`/circles/${circleHandle}/events/${(e as any)._id}`} className="group relative block">
            <Card
                className={cn(
                    "h-full max-w-2xl transition-shadow duration-200 ease-in-out group-hover:shadow-lg",
                    isDraft && "border-dashed border-yellow-400 bg-yellow-50/30 opacity-90",
                    isCancelled && "border-dashed border-red-400 bg-red-50/40 opacity-75",
                )}
            >
                <CardContent className="flex items-start space-x-4 p-4">
                    {e.images && e.images.length > 0 && (
                        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded border">
                            <Image
                                src={e.images[0].fileInfo.url}
                                alt={e.title}
                                fill
                                sizes="96px"
                                className="object-cover transition-transform duration-200 ease-in-out group-hover:scale-105"
                            />
                        </div>
                    )}
                    <div className="min-w-0 flex-grow">
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="header mb-1 truncate text-[20px] font-semibold group-hover:text-primary">
                                {e.title}
                            </div>
                            <div className="flex items-center gap-1">
                                {isDraft && (
                                    <Badge
                                        variant="outline"
                                        className="border-yellow-400 bg-yellow-100 text-xs text-yellow-800"
                                    >
                                        <Clock className="mr-1 h-3 w-3" />
                                        Review
                                    </Badge>
                                )}
                                {isCancelled && (
                                    <Badge variant="outline" className="border-red-400 bg-red-100 text-xs text-red-800">
                                        <Clock className="mr-1 h-3 w-3" />
                                        Cancelled
                                    </Badge>
                                )}
                            </div>
                        </div>
                        {e.description && (
                            <p className="mb-2 line-clamp-3 text-sm text-muted-foreground">{e.description}</p>
                        )}

                        {/* Date/Time */}
                        <div className="mb-1 flex items-center text-xs text-muted-foreground">
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {fmtRange(e.startAt, e.endAt, e.allDay)}
                        </div>

                        {/* Location & attendees */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {locationToString(e) && (
                                <span className="inline-flex items-center">
                                    <MapPin className="mr-1 h-3 w-3" />
                                    {locationToString(e)}
                                </span>
                            )}
                            {attendees > 0 && (
                                <span className="inline-flex items-center">
                                    <Users className="mr-1 h-3 w-3" />
                                    {attendees} going
                                </span>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};

export default function EventTimeline({ circleHandle, events }: Props) {
    // Only show review/published upcoming-ish events; keep cancelled too for visibility but sorted
    const sorted = useMemo(() => {
        return [...(events || [])].sort((a, b) => {
            const sa = new Date(a.startAt).getTime();
            const sb = new Date(b.startAt).getTime();
            return sa - sb;
        });
    }, [events]);

    // Group by Year -> Month
    const grouped: Record<string, Record<number, EventDisplay[]>> = useMemo(() => {
        const g: Record<string, Record<number, EventDisplay[]>> = {};
        for (const e of sorted) {
            const d = new Date(e.startAt);
            const year = String(d.getFullYear());
            const month = d.getMonth(); // 0-11
            if (!g[year]) g[year] = {};
            if (!g[year][month]) g[year][month] = [];
            g[year][month].push(e);
        }
        return g;
    }, [sorted]);

    const yearKeys = useMemo(() => Object.keys(grouped).sort((a, b) => Number(a) - Number(b)), [grouped]);

    if (sorted.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">No events found.</div>;
    }

    return (
        <div className="relative pl-0 pr-2">
            {yearKeys.map((year) => (
                <div key={year} className="relative">
                    <div className="ml-12">
                        {Object.entries(grouped[year])
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([mKey, monthEvents]) => {
                                const monthNum = Number(mKey);
                                const monthDate = new Date(Number(year), monthNum);
                                return (
                                    <div key={`${year}-${monthNum}`} className="relative mb-4">
                                        {/* Color bar */}
                                        <div
                                            className={cn(
                                                "absolute -left-[28px] top-1 h-full w-[4px] rounded-full",
                                                monthColorClasses[monthNum] || "bg-gray-400",
                                            )}
                                        />
                                        {/* Header */}
                                        <div className="header mb-3 text-lg font-semibold text-foreground">
                                            {format(monthDate, "MMMM yyyy")}
                                        </div>
                                        {/* List (single column) */}
                                        <div className="flex flex-col gap-4">
                                            {monthEvents.map((e) => (
                                                <EventCard key={(e as any)._id} e={e} circleHandle={circleHandle} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            ))}
        </div>
    );
}

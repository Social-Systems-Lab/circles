"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { EventDisplay } from "@/models/models";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Clock, MapPin, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { hideCancelledEventAction } from "@/app/circles/[handle]/events/actions";

type Props = {
    circleHandle: string;
    events: EventDisplay[];
    milestones?: { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string }[];
    condensed?: boolean;
    onEventHidden?: (eventId: string) => void;
    onNavigate?: () => void;
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

// Ongoing: now between start and end
function isOngoing(evt: EventDisplay): boolean {
    const start = evt.startAt ? new Date(evt.startAt as any) : undefined;
    const end = evt.endAt ? new Date(evt.endAt as any) : undefined;
    if (!start || !end) return false;
    const now = new Date();
    return now >= start && now <= end;
}

// Show join button from 5 minutes before start until the event ends (or 2h after start if no end)
function isWithinJoinWindow(evt: EventDisplay): boolean {
    const start = evt.startAt ? new Date(evt.startAt as any) : undefined;
    const end = evt.endAt ? new Date(evt.endAt as any) : undefined;
    if (!start) return false;
    const now = new Date();
    const startMinus5 = new Date(start.getTime() - 5 * 60 * 1000);
    if (end) {
        return now >= startMinus5 && now <= end;
    }
    // Fallback if no end: allow for 2 hours after start
    const fallbackEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return now >= startMinus5 && now <= fallbackEnd;
}

const EventCard: React.FC<{
    e: EventDisplay;
    circleHandle: string;
    condensed?: boolean;
    onHideCancelled?: (eventId: string) => Promise<void> | void;
    hidePending?: boolean;
    onNavigate?: () => void;
}> = ({ e, circleHandle, condensed, onHideCancelled, hidePending, onNavigate }) => {
    const stage = e.stage;
    const isDraft = stage === "review";
    const isCancelled = stage === "cancelled";
    const attendees = e.attendees ?? 0;
    const ongoing = isOngoing(e);
    const eventId = ((e as any)._id?.toString?.() || (e as any)._id || "") as string;

    return (
        <Card
            className={cn(
                "relative h-full max-w-2xl transition-shadow duration-200 ease-in-out group-hover:shadow-lg",
                isDraft && "border-dashed border-yellow-400 bg-yellow-50/30 opacity-90",
                isCancelled && "border-dashed border-red-400 bg-red-50/40 opacity-75",
                ongoing && !isCancelled && "border-2 border-red-500",
            )}
        >
            <Link
                href={`/circles/${circleHandle}/events/${(e as any)._id}`}
                className="group block"
                onClick={() => onNavigate?.()}
            >
                <CardContent className={cn("flex items-start", condensed ? "space-x-3 p-3" : "space-x-4 p-4")}>
                    {e.images && e.images.length > 0 && (
                        <div
                            className={cn(
                                "relative flex-shrink-0 overflow-hidden rounded border",
                                condensed ? "h-16 w-16" : "h-24 w-24",
                            )}
                        >
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
                            <div
                                className={cn(
                                    "header mb-1 truncate font-semibold group-hover:text-primary",
                                    condensed ? "text-[16px]" : "text-[20px]",
                                )}
                            >
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
                            <p
                                className={cn(
                                    "mb-2 text-muted-foreground",
                                    condensed ? "line-clamp-2 text-xs" : "line-clamp-3 text-sm",
                                )}
                            >
                                {e.description}
                            </p>
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
            </Link>
            {e.isVirtual && e.virtualUrl && isWithinJoinWindow(e) && !isCancelled && (
                <Button
                    size="sm"
                    className="absolute right-2 top-2 z-10 bg-green-600 text-white hover:bg-green-700"
                    onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        window.open(e.virtualUrl!, "_blank", "noopener,noreferrer");
                    }}
                >
                    Join
                </Button>
            )}
            {isCancelled && onHideCancelled && eventId && (
                <Button
                    size="sm"
                    variant="default"
                    className="absolute bottom-2 right-2 z-10 bg-black text-white hover:bg-black/80 focus-visible:ring-white disabled:bg-black/60 disabled:text-white/80"
                    disabled={hidePending}
                    onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onHideCancelled(eventId);
                    }}
                >
                    {hidePending ? "Hiding…" : "Hide"}
                </Button>
            )}
        </Card>
    );
};

// Condensed one-line milestone row
const MilestoneRow: React.FC<{
    m: { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string };
    circleHandle: string;
    onNavigate?: () => void;
}> = ({ m, circleHandle, onNavigate }) => {
    const icon = m.type === "goal" ? "🎯" : m.type === "task" ? "🧩" : "🐞";
    const href =
        m.type === "goal"
            ? `/circles/${circleHandle}/goals/${m.id}`
            : m.type === "task"
              ? `/circles/${circleHandle}/tasks/${m.id}`
              : `/circles/${circleHandle}/issues/${m.id}`;
    return (
        <Link
            href={href}
            className="group block"
            onClick={() => onNavigate?.()}
        >
            <div className="flex items-center gap-2 truncate rounded border bg-white px-3 py-2 text-xs hover:bg-muted/40">
                <span className="select-none">{icon}</span>
                <span className="truncate">{m.title}</span>
                <span className="ml-auto inline-flex items-center text-muted-foreground">
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {format(new Date(m.date), "MMM d, yyyy")}
                </span>
            </div>
        </Link>
    );
};

export default function EventTimeline({
    circleHandle,
    events,
    milestones,
    condensed,
    onEventHidden,
    onNavigate,
}: Props) {
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [locallyHiddenIds, setLocallyHiddenIds] = useState<string[]>([]);
    const [pendingHideId, setPendingHideId] = useState<string | null>(null);

    const handleHideCancelled = useCallback(
        async (eventId: string) => {
            if (!eventId) return;
            setPendingHideId(eventId);
            try {
                const res = await hideCancelledEventAction(circleHandle, eventId);
                if (res.success) {
                    setLocallyHiddenIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
                    setUser((prev) => {
                        if (!prev) return prev;
                        const nextHidden = new Set(prev.hiddenCancelledEventIds || []);
                        nextHidden.add(eventId);
                        return { ...prev, hiddenCancelledEventIds: Array.from(nextHidden) };
                    });
                    onEventHidden?.(eventId);
                    toast({
                        title: "Event hidden",
                        description: "This cancelled event will no longer appear in your event lists.",
                    });
                } else {
                    toast({
                        title: "Unable to hide event",
                        description: res.message || "Please try again.",
                        variant: "destructive",
                    });
                }
            } catch (error) {
                console.error("hideCancelledEventAction failed:", error);
                toast({
                    title: "Unable to hide event",
                    description: "Something went wrong. Please try again.",
                    variant: "destructive",
                });
            } finally {
                setPendingHideId(null);
            }
        },
        [circleHandle, onEventHidden, setUser, toast],
    );

    // Build combined list of future/ongoing entries: events + dated milestones
    const combined = useMemo(() => {
        const now = new Date();

        const eventEntries =
            (events || [])
                .filter((e) => {
                    const id = ((e as any)._id?.toString?.() || (e as any)._id || "") as string;
                    if (id && locallyHiddenIds.includes(id)) {
                        return false;
                    }
                    const start = e.startAt ? new Date(e.startAt as any) : undefined;
                    const end = e.endAt ? new Date(e.endAt as any) : undefined;
                    if (end) return end >= now; // include ongoing or future (ends in future)
                    if (start) return start >= now; // include if start is in the future when no end
                    return false; // exclude undated events
                })
                .map((e) => ({
                    kind: "event" as const,
                    date: new Date(e.startAt),
                    event: e,
                })) || [];

        const milestoneEntries =
            (milestones || [])
                .filter((m) => m.date)
                .filter((m) => {
                    const d = new Date(m.date);
                    return d >= now;
                })
                .map((m) => ({
                    kind: "milestone" as const,
                    date: new Date(m.date),
                    milestone: m,
                })) || [];

        const all = [...eventEntries, ...milestoneEntries];
        all.sort((a, b) => a.date.getTime() - b.date.getTime());
        return all;
    }, [events, milestones, locallyHiddenIds]);

    // Group by Year -> Month
    const grouped: Record<string, Record<number, typeof combined>> = useMemo(() => {
        const g: Record<string, Record<number, typeof combined>> = {};
        for (const item of combined) {
            const d = item.date;
            const year = String(d.getFullYear());
            const month = d.getMonth();
            if (!g[year]) g[year] = {};
            if (!g[year][month]) g[year][month] = [];
            g[year][month].push(item);
        }
        return g;
    }, [combined]);

    const yearKeys = useMemo(() => Object.keys(grouped).sort((a, b) => Number(a) - Number(b)), [grouped]);

    if (combined.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">No upcoming items found.</div>;
    }

    return (
        <div className="relative pl-0 pr-2">
            {yearKeys.map((year) => (
                <div key={year} className="relative">
                    <div className="ml-12">
                        {Object.entries(grouped[year])
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([mKey, monthItems]) => {
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
                                        <div className={cn("flex flex-col", condensed ? "gap-2" : "gap-4")}>
                                            {monthItems.map((it, idx) => {
                                                if (it.kind === "event") {
                                                    const eventId =
                                                        ((it.event as any)._id?.toString?.() ||
                                                            (it.event as any)._id ||
                                                            "") as string;
                                                    return (
                                                        <EventCard
                                                            key={`${(it.event as any)._id}-${idx}`}
                                                            e={it.event}
                                                            circleHandle={circleHandle}
                                                            condensed={condensed}
                                                            onHideCancelled={handleHideCancelled}
                                                            hidePending={pendingHideId === eventId}
                                                            onNavigate={onNavigate}
                                                        />
                                                    );
                                                }
                                                return (
                                                    <MilestoneRow
                                                        key={`${it.milestone.type}:${it.milestone.id}-${idx}`}
                                                        m={it.milestone}
                                                        circleHandle={circleHandle}
                                                        onNavigate={onNavigate}
                                                    />
                                                );
                                            })}
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

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { EventDisplay, TaskDisplay } from "@/models/models";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AlertCircle, CalendarIcon, CheckSquare, Clock, MapPin, Users, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { hideCancelledEventAction } from "@/app/circles/[handle]/events/actions";
import { getEventJoinState } from "./event-join-state";
import { getShiftConfirmedSummary, getShiftDisplayStatus, getShiftPendingSummary } from "../tasks/shift-task-utils";

type Props = {
    circleHandle: string;
    events: EventDisplay[];
    shifts?: ShiftTimelineItem[];
    milestones?: {
        id: string;
        type: "goal" | "task" | "issue";
        title: string;
        date: Date | string;
        circleHandle?: string;
    }[];
    condensed?: boolean;
    onEventHidden?: (eventId: string) => void;
    onNavigate?: () => void;
};

export type ShiftTimelineItem = {
    id: string;
    task: TaskDisplay;
    circleHandle?: string;
    startAt: Date | string | null;
    endAt?: Date | string | null;
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
    if (!startAt) return "";
    const s = new Date(startAt);
    if (!endAt) {
        return allDay ? format(s, "EEE, MMM d, yyyy") : format(s, "EEE, MMM d, yyyy • p");
    }
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

function getCanonicalEventId(evt: EventDisplay): string {
    const rawId = (evt as any).originalEventId ?? (evt as any)._id;
    return rawId?.toString?.() || rawId || "";
}

// Ongoing: now between start and end
function isOngoing(evt: EventDisplay): boolean {
    const start = evt.startAt ? new Date(evt.startAt as any) : undefined;
    const end = evt.endAt ? new Date(evt.endAt as any) : undefined;
    if (!start || !end) return false;
    const now = new Date();
    return now >= start && now <= end;
}

function shiftLocationToString(task: TaskDisplay): string | undefined {
    const loc = task.location;
    if (!loc) return undefined;
    const parts = [loc.street, loc.city, loc.region, loc.country].filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : undefined;
}

function getShiftStageLabel(task: TaskDisplay): { label: string; className: string } {
    switch (getShiftDisplayStatus(task)) {
        case "review":
            return { label: "Review", className: "border-yellow-400 bg-yellow-100 text-yellow-800" };
        case "inProgress":
            return { label: "In Progress", className: "border-orange-300 bg-orange-100 text-orange-800" };
        case "completed":
            return { label: "Completed", className: "border-green-300 bg-green-100 text-green-800" };
        default:
            return { label: "Upcoming", className: "border-sky-300 bg-sky-100 text-sky-800" };
    }
}

const EventCard: React.FC<{
    e: EventDisplay;
    circleHandle: string;
    condensed?: boolean;
    canManageJoinLink?: boolean;
    onHideCancelled?: (eventId: string) => Promise<void> | void;
    hidePending?: boolean;
    onNavigate?: () => void;
}> = ({ e, circleHandle, condensed, canManageJoinLink, onHideCancelled, hidePending, onNavigate }) => {
    const stage = e.stage;
    const isDraft = stage === "draft";
    const isReview = stage === "review";
    const isCancelled = stage === "cancelled";
    const attendees = e.attendees ?? 0;
    const ongoing = isOngoing(e);
    const eventId = getCanonicalEventId(e);
    const router = useRouter();
    const joinState = getEventJoinState(e, {
        canManageMissingLink: canManageJoinLink,
        missingLinkLabel: "Missing link",
    });

    return (
        <Card
            className={cn(
                "relative h-full max-w-2xl transition-shadow duration-200 ease-in-out group-hover:shadow-lg",
                (isDraft || isReview) && "border-dashed border-yellow-400 bg-yellow-50/30 opacity-90",
                isCancelled && "border-dashed border-red-400 bg-red-50/40 opacity-75",
                ongoing && !isCancelled && "border-2 border-red-500",
            )}
        >
            <Link
                href={`/circles/${circleHandle}/events/${(e as any)._id}#circle-tabs`}
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
                                        Draft
                                    </Badge>
                                )}
                                {isReview && (
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
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="relative z-10 h-6 max-w-full px-2 text-xs hover:bg-gray-300"
                                    onClick={(ev) => {
                                        ev.preventDefault();
                                        ev.stopPropagation();
                                        onNavigate?.();
                                        router.push(`/explore?focusEvent=${eventId}`);
                                    }}
                                >
                                    <MapPin className="mr-1 h-3 w-3 shrink-0" />
                                    <span className="truncate">{locationToString(e)}</span>
                                </Button>
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
            {joinState && !isCancelled && (
                <span className="absolute right-2 top-2 z-10" title={joinState.title}>
                    <Button
                        size="sm"
                        type="button"
                        variant={joinState.isEnabled ? "default" : "outline"}
                        disabled={!joinState.isEnabled}
                        className={cn(
                            joinState.isEnabled && "bg-green-600 text-white hover:bg-green-700",
                            !joinState.isEnabled &&
                                !joinState.isMissingLink &&
                                "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-100 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-700 disabled:opacity-100",
                            joinState.isMissingLink &&
                                "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100 disabled:border-amber-300 disabled:bg-amber-100 disabled:text-amber-900 disabled:opacity-100",
                        )}
                        onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (joinState.isEnabled && joinState.href) {
                                window.open(joinState.href, "_blank", "noopener,noreferrer");
                            }
                        }}
                    >
                        {joinState.label}
                    </Button>
                </span>
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

const ShiftCard: React.FC<{
    shift: ShiftTimelineItem;
    fallbackCircleHandle: string;
    condensed?: boolean;
    onNavigate?: () => void;
}> = ({ shift, fallbackCircleHandle, condensed, onNavigate }) => {
    const task = shift.task;
    const taskCircleHandle = shift.circleHandle || fallbackCircleHandle;
    const shiftStage = getShiftStageLabel(task);
    const pendingSummary = getShiftPendingSummary(task);
    const locationLabel = shiftLocationToString(task);

    return (
        <Card className="relative h-full max-w-2xl border-sky-200 bg-sky-50/40 transition-shadow duration-200 ease-in-out group-hover:shadow-lg">
            <Link
                href={`/circles/${taskCircleHandle}/tasks/${task._id}?source=events#circle-tabs`}
                className="group block"
                onClick={() => onNavigate?.()}
            >
                <CardContent className={cn("flex items-start", condensed ? "space-x-3 p-3" : "space-x-4 p-4")}>
                    {task.images && task.images.length > 0 && (
                        <div
                            className={cn(
                                "relative flex-shrink-0 overflow-hidden rounded border",
                                condensed ? "h-16 w-16" : "h-24 w-24",
                            )}
                        >
                            <Image
                                src={task.images[0].fileInfo.url}
                                alt={task.title}
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
                                {task.title}
                            </div>
                            <div className="flex items-center gap-1">
                                <Badge className="border-transparent bg-sky-100 text-sky-800">Shift</Badge>
                                <Badge variant="outline" className={shiftStage.className}>
                                    <Clock className="mr-1 h-3 w-3" />
                                    {shiftStage.label}
                                </Badge>
                            </div>
                        </div>

                        {task.description && (
                            <p
                                className={cn(
                                    "mb-2 text-muted-foreground",
                                    condensed ? "line-clamp-2 text-xs" : "line-clamp-3 text-sm",
                                )}
                            >
                                {task.description}
                            </p>
                        )}

                        <div className="mb-1 flex items-center text-xs text-muted-foreground">
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {fmtRange(shift.startAt ?? undefined, shift.endAt ?? undefined, false)}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center">
                                <Users className="mr-1 h-3 w-3" />
                                {getShiftConfirmedSummary(task)}
                            </span>
                            {pendingSummary && <span className="text-amber-700">{pendingSummary}</span>}
                            {locationLabel && (
                                <span className="inline-flex items-center">
                                    <MapPin className="mr-1 h-3 w-3" />
                                    {locationLabel}
                                </span>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Link>
        </Card>
    );
};

// Condensed one-line milestone row
const MilestoneRow: React.FC<{
    m: { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string; circleHandle?: string };
    circleHandle: string;
    onNavigate?: () => void;
    isOverdue?: boolean;
}> = ({ m, circleHandle, onNavigate, isOverdue }) => {
    const icon =
        m.type === "goal" ? (
            <span className="select-none">🎯</span>
        ) : m.type === "task" ? (
            <CheckSquare className="h-4 w-4 shrink-0 rounded-sm bg-rose-100 p-[1px] text-rose-700 ring-1 ring-rose-200" />
        ) : (
            <span className="select-none">🐞</span>
        );
    const targetCircleHandle = m.circleHandle || circleHandle;
    const href =
        m.type === "goal"
            ? `/circles/${targetCircleHandle}/goals/${m.id}#circle-tabs`
            : m.type === "task"
              ? `/circles/${targetCircleHandle}/tasks/${m.id}#circle-tabs`
              : `/circles/${targetCircleHandle}/issues/${m.id}#circle-tabs`;

    const editHref =
        m.type === "goal"
            ? `/circles/${targetCircleHandle}/goals/${m.id}/edit`
            : m.type === "task"
              ? `/circles/${targetCircleHandle}/tasks/${m.id}/edit`
              : `/circles/${targetCircleHandle}/issues/${m.id}/edit`;

    return (
        <div className="group flex items-center gap-2">
            <Link href={href} className="block flex-grow" onClick={() => onNavigate?.()}>
                <div
                    className={cn(
                        "flex items-center gap-2 truncate rounded border bg-white px-3 py-2 text-xs hover:bg-muted/40",
                        isOverdue && "border-red-200 bg-red-50 hover:bg-red-100/50",
                    )}
                >
                    {icon}
                    <span className="flex-grow truncate">{m.title}</span>
                    <span
                        className={cn(
                            "ml-auto inline-flex items-center",
                            isOverdue ? "font-medium text-red-600" : "text-muted-foreground",
                        )}
                    >
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        {format(new Date(m.date), "MMM d, yyyy")}
                    </span>
                </div>
            </Link>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                asChild
                onClick={() => onNavigate?.()}
            >
                <Link href={editHref}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                </Link>
            </Button>
        </div>
    );
};

export default function EventTimeline({
    circleHandle,
    events,
    shifts,
    milestones,
    condensed,
    onEventHidden,
    onNavigate,
}: Props) {
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [user, setUser] = useAtom(userAtom);
    const [locallyHiddenIds, setLocallyHiddenIds] = useState<string[]>([]);
    const [pendingHideId, setPendingHideId] = useState<string | null>(null);
    const [itemFilter, setItemFilter] = useState<"all" | "events" | "shifts">("all");

    useEffect(() => {
        const filterParam = (searchParams.get("filter") || "").toLowerCase();
        if (filterParam === "events" || filterParam === "shifts") {
            setItemFilter(filterParam);
            return;
        }

        setItemFilter("all");
    }, [searchParams]);

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

    // Build combined list of future/ongoing entries, overdue milestones, and past event entries.
    const { upcoming, overdue, pastEvents } = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const visibleEvents =
            (events || []).filter((e) => {
                const id = getCanonicalEventId(e);
                return !(id && locallyHiddenIds.includes(id));
            }) || [];

        const upcomingEventEntries = visibleEvents
            .filter((e) => {
                const start = e.startAt ? new Date(e.startAt as any) : undefined;
                const end = e.endAt ? new Date(e.endAt as any) : undefined;
                if (end) return end >= now;
                if (start) return start >= now;
                return false;
            })
            .map((e) => ({
                kind: "event" as const,
                date: new Date(e.startAt),
                event: e,
            }));

        const upcomingShiftEntries = (shifts || [])
            .filter((shift) => {
                if (!shift.startAt) {
                    return false;
                }

                const start = new Date(shift.startAt);
                const end = shift.endAt ? new Date(shift.endAt) : undefined;
                if (end) return end >= now;
                return start >= now;
            })
            .map((shift) => ({
                kind: "shift" as const,
                date: new Date(shift.startAt as Date | string),
                shift,
            }));

        const pastEventEntries = visibleEvents
            .filter((e) => {
                const end = e.endAt ? new Date(e.endAt as any) : undefined;
                const start = e.startAt ? new Date(e.startAt as any) : undefined;
                if (end) return end < now;
                if (start) return start < now;
                return false;
            })
            .map((e) => ({
                date: new Date(e.startAt),
                event: e,
            }));

        const allMilestones = (milestones || [])
            .filter((m) => m.date)
            .map((m) => ({
                kind: "milestone" as const,
                date: new Date(m.date),
                milestone: m,
            }));

        const overdueItems = allMilestones.filter((m) => m.date < startOfToday);
        const upcomingMilestones = allMilestones.filter((m) => m.date >= startOfToday);

        const upcomingItems =
            itemFilter === "events"
                ? upcomingEventEntries
                : itemFilter === "shifts"
                  ? upcomingShiftEntries
                  : [...upcomingEventEntries, ...upcomingShiftEntries, ...upcomingMilestones];
        upcomingItems.sort((a, b) => a.date.getTime() - b.date.getTime());
        overdueItems.sort((a, b) => a.date.getTime() - b.date.getTime());
        pastEventEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

        return { upcoming: upcomingItems, overdue: overdueItems, pastEvents: pastEventEntries };
    }, [events, itemFilter, milestones, locallyHiddenIds, shifts]);

    // Group by Year -> Month
    const grouped: Record<string, Record<number, typeof upcoming>> = useMemo(() => {
        const g: Record<string, Record<number, typeof upcoming>> = {};
        for (const item of upcoming) {
            const d = item.date;
            const year = String(d.getFullYear());
            const month = d.getMonth();
            if (!g[year]) g[year] = {};
            if (!g[year][month]) g[year][month] = [];
            g[year][month].push(item);
        }
        return g;
    }, [upcoming]);

    const yearKeys = useMemo(() => Object.keys(grouped).sort((a, b) => Number(a) - Number(b)), [grouped]);

    const pastGrouped = useMemo(() => {
        const g: Record<string, Record<number, typeof pastEvents>> = {};
        for (const item of pastEvents) {
            const d = item.date;
            const year = String(d.getFullYear());
            const month = d.getMonth();
            if (!g[year]) g[year] = {};
            if (!g[year][month]) g[year][month] = [];
            g[year][month].push(item);
        }
        return g;
    }, [pastEvents]);

    const pastYearKeys = useMemo(() => Object.keys(pastGrouped).sort((a, b) => Number(b) - Number(a)), [pastGrouped]);

    const showOverdue = itemFilter === "all" && overdue.length > 0;
    const showPastEvents = itemFilter !== "shifts" && pastEvents.length > 0;

    if (upcoming.length === 0 && !showOverdue && !showPastEvents) {
        return (
            <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    {(["all", "events", "shifts"] as const).map((value) => (
                        <Button
                            key={value}
                            type="button"
                            variant={itemFilter === value ? "default" : "outline"}
                            className={cn(itemFilter === value && "bg-slate-900 text-white hover:bg-slate-800")}
                            onClick={() => setItemFilter(value)}
                        >
                            {value === "all" ? "All" : value === "events" ? "Events" : "Shifts"}
                        </Button>
                    ))}
                </div>
                <div className="text-center text-muted-foreground">
                    {itemFilter === "shifts" ? "No upcoming shifts found." : "No upcoming items found."}
                </div>
            </div>
        );
    }

    return (
        <div className="relative pl-0 pr-2">
            <div className="mb-4 flex flex-wrap items-center gap-2">
                {(["all", "events", "shifts"] as const).map((value) => (
                    <Button
                        key={value}
                        type="button"
                        variant={itemFilter === value ? "default" : "outline"}
                        className={cn(itemFilter === value && "bg-slate-900 text-white hover:bg-slate-800")}
                        onClick={() => setItemFilter(value)}
                    >
                        {value === "all" ? "All" : value === "events" ? "Events" : "Shifts"}
                    </Button>
                ))}
            </div>

            {/* Overdue Section */}
            {showOverdue && (
                <div className="mb-8">
                    <div className="mb-3 ml-12 flex items-center gap-2 text-lg font-semibold text-red-600">
                        <AlertCircle className="h-5 w-5" />
                        Overdue
                    </div>
                    <div className="ml-12 flex flex-col gap-2">
                        {overdue.map((it, idx) => (
                            <MilestoneRow
                                key={`overdue-${it.milestone.type}:${it.milestone.id}-${idx}`}
                                m={it.milestone}
                                circleHandle={circleHandle}
                                onNavigate={onNavigate}
                                isOverdue
                            />
                        ))}
                    </div>
                    <div className="my-6 ml-12 border-t border-dashed" />
                </div>
            )}

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
                                                    const eventId = ((it.event as any)._id?.toString?.() ||
                                                        (it.event as any)._id ||
                                                        "") as string;
                                                    return (
                                                        <EventCard
                                                            key={`${(it.event as any)._id}-${idx}`}
                                                            e={it.event}
                                                            circleHandle={circleHandle}
                                                            condensed={condensed}
                                                            canManageJoinLink={Boolean(
                                                                user?.did && user.did === it.event.createdBy,
                                                            )}
                                                            onHideCancelled={handleHideCancelled}
                                                            hidePending={pendingHideId === eventId}
                                                            onNavigate={onNavigate}
                                                        />
                                                    );
                                                }
                                                if (it.kind === "shift") {
                                                    return (
                                                        <ShiftCard
                                                            key={`shift-${it.shift.id}-${idx}`}
                                                            shift={it.shift}
                                                            fallbackCircleHandle={circleHandle}
                                                            condensed={condensed}
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

            {showPastEvents && (
                <div className="mt-10">
                    <div className="mb-4 ml-12 text-lg font-semibold text-muted-foreground">Past Events</div>
                    {pastYearKeys.map((year) => (
                        <div key={`past-${year}`} className="relative">
                            <div className="ml-12">
                                {Object.entries(pastGrouped[year])
                                    .sort(([a], [b]) => Number(b) - Number(a))
                                    .map(([mKey, monthItems]) => {
                                        const monthNum = Number(mKey);
                                        const monthDate = new Date(Number(year), monthNum);
                                        return (
                                            <div key={`past-${year}-${monthNum}`} className="relative mb-4">
                                                <div
                                                    className={cn(
                                                        "absolute -left-[28px] top-1 h-full w-[4px] rounded-full",
                                                        monthColorClasses[monthNum] || "bg-gray-400",
                                                    )}
                                                />
                                                <div className="header mb-3 text-lg font-semibold text-foreground">
                                                    {format(monthDate, "MMMM yyyy")}
                                                </div>
                                                <div className={cn("flex flex-col", condensed ? "gap-2" : "gap-4")}>
                                                    {monthItems.map((it, idx) => {
                                                        const eventId = ((it.event as any)._id?.toString?.() ||
                                                            (it.event as any)._id ||
                                                            "") as string;
                                                        return (
                                                            <EventCard
                                                                key={`past-${(it.event as any)._id}-${idx}`}
                                                                e={it.event}
                                                                circleHandle={circleHandle}
                                                                condensed={condensed}
                                                                canManageJoinLink={Boolean(
                                                                    user?.did && user.did === it.event.createdBy,
                                                                )}
                                                                onHideCancelled={handleHideCancelled}
                                                                hidePending={pendingHideId === eventId}
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
            )}
        </div>
    );
}

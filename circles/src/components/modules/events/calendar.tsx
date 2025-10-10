"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import { EventClickArg } from "@fullcalendar/core";
import { useRouter } from "next/navigation";
import { EventDisplay } from "@/models/models";

// FullCalendar styles (plugin CSS)

type CalendarViewProps = {
    circleHandle: string;
    events: EventDisplay[];
    milestones?: { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string }[];
};

const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

const CalendarView: React.FC<CalendarViewProps> = ({ circleHandle, events, milestones }) => {
    const router = useRouter();

    const fcEvents = useMemo(() => {
        const eventItems =
            (events || []).map((e) => ({
                id: (e as any)._id?.toString?.() || "",
                title: e.title,
                start: e.startAt ? new Date(e.startAt) : undefined,
                end: e.endAt ? new Date(e.endAt) : undefined,
                allDay: !!e.allDay,
                extendedProps: {
                    type: "event",
                    itemId: (e as any)._id?.toString?.() || "",
                    location: e.location,
                    isVirtual: e.isVirtual,
                    virtualUrl: e.virtualUrl,
                    isHybrid: e.isHybrid,
                    attendees: e.attendees ?? 0,
                    userRsvpStatus: e.userRsvpStatus ?? "none",
                    stage: e.stage,
                },
            })) || [];

        const milestoneItems =
            (milestones || []).map((m) => ({
                id: `m:${m.type}:${m.id}`,
                title: (m.type === "goal" ? "🎯 " : m.type === "task" ? "🧩 " : "🐞 ") + m.title,
                start: m.date ? new Date(m.date) : undefined,
                end: undefined,
                allDay: true,
                extendedProps: {
                    type: m.type,
                    itemId: m.id,
                },
            })) || [];

        return [...eventItems, ...milestoneItems];
    }, [events, milestones]);

    const handleDateClick = (arg: DateClickArg) => {
        // Prefill create form with clicked date (basic)
        const dt = arg.date;
        const startISO = new Date(dt).toISOString();
        // Default end 2 hours later
        const endISO = new Date(dt.getTime() + 2 * 60 * 60 * 1000).toISOString();
        router.push(
            `/circles/${circleHandle}/events/create?startAt=${encodeURIComponent(startISO)}&endAt=${encodeURIComponent(endISO)}`,
        );
    };

    const handleEventClick = (clickInfo: EventClickArg) => {
        const ext = (clickInfo.event.extendedProps as any) || {};
        const type = ext.type as string | undefined;
        const itemId = (ext.itemId as string | undefined) || clickInfo.event.id;
        if (!itemId) return;

        if (type === "goal") {
            router.push(`/circles/${circleHandle}/goals/${itemId}`);
        } else if (type === "task") {
            router.push(`/circles/${circleHandle}/tasks/${itemId}`);
        } else if (type === "issue") {
            router.push(`/circles/${circleHandle}/issues/${itemId}`);
        } else {
            // default to event
            router.push(`/circles/${circleHandle}/events/${itemId}`);
        }
    };

    const renderEventContent = (arg: any) => {
        const ext = (arg.event.extendedProps as any) || {};
        const type = ext.type as string | undefined;

        // Condensed rendering for milestones (goal/task/issue)
        if (type === "goal" || type === "task" || type === "issue") {
            return (
                <div className="max-w-full truncate text-xs" title={arg.event.title}>
                    {arg.event.title}
                </div>
            );
        }

        // Default rendering for events
        const stage = ext?.stage as string | undefined;
        const isDraft = stage === "draft";
        const isCancelled = stage === "cancelled";
        const title = arg.event.title + (isDraft ? " (draft)" : "");
        const style: React.CSSProperties = {};
        if (isCancelled) style.textDecoration = "line-through";
        if (isDraft) style.color = "#6c757d"; // grey text similar to Bootstrap secondary
        return (
            <div className="max-w-full truncate" style={style} title={arg.event.title}>
                {title}
            </div>
        );
    };

    // Highlight ongoing events (now between start and end)
    const isOngoing = (start?: Date | null, end?: Date | null): boolean => {
        if (!start || !end) return false;
        const now = new Date();
        return now >= start && now <= end;
    };

    const eventClassNames = (arg: any): string[] => {
        const stage = (arg.event.extendedProps as any)?.stage as string | undefined;
        const isCancelled = stage === "cancelled";
        const ongoing = isOngoing(arg.event.start, arg.event.end);
        const classes: string[] = [];
        if (ongoing && !isCancelled) {
            classes.push("ongoing-event");
        }
        return classes;
    };

    return (
        <div className="rounded-md border bg-white p-2">
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,timeGridWeek,listWeek",
                }}
                height="auto"
                events={fcEvents}
                eventContent={renderEventContent}
                eventClassNames={eventClassNames}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                selectable={true}
                firstDay={1}
            />
        </div>
    );
};

export default CalendarView;

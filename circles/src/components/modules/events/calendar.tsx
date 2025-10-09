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
};

const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

const CalendarView: React.FC<CalendarViewProps> = ({ circleHandle, events }) => {
    const router = useRouter();

    const fcEvents = useMemo(
        () =>
            (events || []).map((e) => ({
                id: (e as any)._id?.toString?.() || "",
                title: e.title,
                start: e.startAt ? new Date(e.startAt) : undefined,
                end: e.endAt ? new Date(e.endAt) : undefined,
                allDay: !!e.allDay,
                extendedProps: {
                    location: e.location,
                    isVirtual: e.isVirtual,
                    virtualUrl: e.virtualUrl,
                    isHybrid: e.isHybrid,
                    attendees: e.attendees ?? 0,
                    userRsvpStatus: e.userRsvpStatus ?? "none",
                    stage: e.stage,
                },
            })),
        [events],
    );

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
        const id = clickInfo.event.id;
        if (id) {
            router.push(`/circles/${circleHandle}/events/${id}`);
        }
    };

    const renderEventContent = (arg: any) => {
        const stage = (arg.event.extendedProps as any)?.stage as string | undefined;
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

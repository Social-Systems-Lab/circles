"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import type { TaskDisplay } from "@/models/models";
import { getShiftEndAt, getShiftStartAt } from "@/components/modules/tasks/shift-task-utils";

type UpcomingShiftsPanelVisibility = "visible" | "sign_in" | "members_only";

type UpcomingShiftsPanelProps = {
    circleHandle: string;
    shifts: TaskDisplay[];
    visibility: UpcomingShiftsPanelVisibility;
};

const formatShiftDateTime = (task: TaskDisplay) => {
    const startAt = getShiftStartAt(task);
    const endAt = getShiftEndAt(task);

    if (!startAt) {
        return "Schedule to be confirmed";
    }

    const dayLabel = format(startAt, "EEE, d MMM");
    const startLabel = format(startAt, "h:mm a");
    const endLabel = endAt ? format(endAt, "h:mm a") : null;

    return endLabel ? `${dayLabel} · ${startLabel} - ${endLabel}` : `${dayLabel} · ${startLabel}`;
};

const getCapacityLabel = (task: TaskDisplay) => {
    const slots = task.slots ?? 0;
    const signedUpCount = task.participants?.length ?? 0;

    if (slots < 1) {
        return "Capacity to be confirmed";
    }

    const remainingSpots = Math.max(slots - signedUpCount, 0);
    return `${remainingSpots} spot${remainingSpots === 1 ? "" : "s"} available`;
};

export function UpcomingShiftsPanel({ circleHandle, shifts, visibility }: UpcomingShiftsPanelProps) {
    const hasVisibleShifts = visibility === "visible" && shifts.length > 0;

    return (
        <div className="rounded-[15px] border-0 bg-white px-4 pb-4 pt-3 shadow-lg sm:px-5 sm:pb-5 sm:pt-4 md:px-6 md:pb-6 md:pt-5">
            <div className="mb-2.5">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Upcoming Shifts</div>
                    {visibility === "visible" ? (
                        <Button asChild variant="ghost" size="sm">
                            <Link href={`/circles/${circleHandle}/events?filter=shifts`}>View all</Link>
                        </Button>
                    ) : null}
                </div>
            </div>

            {visibility === "sign_in" ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">Sign in to see upcoming shifts and request a spot.</p>
                    <Button asChild size="sm">
                        <Link href="/login">Sign in</Link>
                    </Button>
                </div>
            ) : visibility === "members_only" ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Upcoming shifts are only visible to circle members.
                </div>
            ) : hasVisibleShifts ? (
                <div className="space-y-2">
                    {shifts.map((shift) => {
                        return (
                            <div
                                key={String(shift._id || shift.title)}
                                className="rounded-xl border border-slate-200 p-3 sm:p-4"
                            >
                                <div className="space-y-1.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-slate-900 sm:text-[15px]">{shift.title}</div>
                                        <div className="mt-0.5 text-sm text-slate-600">{formatShiftDateTime(shift)}</div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-medium text-emerald-700">{getCapacityLabel(shift)}</div>
                                        <Button asChild size="sm" className="shrink-0">
                                            <Link href={`/circles/${circleHandle}/tasks/${shift._id}?source=about`}>
                                                View shift
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No upcoming shifts yet.
                </div>
            )}
        </div>
    );
}

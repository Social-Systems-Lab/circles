"use client";

import React, { useTransition } from "react";
import { EventDisplay } from "@/models/models";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { rsvpEventAction, cancelRsvpAction, changeEventStageAction } from "@/app/circles/[handle]/events/actions";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

type Props = {
    circleHandle: string;
    event: EventDisplay;
    canEdit?: boolean;
    canReview?: boolean;
    canModerate?: boolean;
    isAuthor?: boolean;
    isPreview?: boolean;
};

function googleCalendarUrl(e: EventDisplay) {
    const formatGoogle = (d?: Date) => (d ? format(new Date(d), "yyyyMMdd'T'HHmmss'Z'") : "");
    const dates = `${formatGoogle(e.startAt as any)}/${formatGoogle(e.endAt as any)}`;
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: e.title || "Event",
        details: e.description || "",
        dates,
    });
    if (e.isVirtual && e.virtualUrl) {
        params.set("location", e.virtualUrl);
    } else if (e.location?.city) {
        params.set("location", e.location.city);
    }
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function EventDetail({
    circleHandle,
    event,
    canEdit,
    canReview,
    canModerate,
    isAuthor,
    isPreview,
}: Props) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const compact = !!isPreview;

    const onRsvp = (status: "going" | "interested" | "waitlist") => {
        startTransition(async () => {
            const res = await rsvpEventAction(circleHandle, (event as any)._id?.toString?.() || "", status);
            if (res.success) {
                toast({ title: "RSVP updated" });
                router.refresh();
            } else {
                toast({ title: "Error", description: res.message || "Failed to RSVP", variant: "destructive" });
            }
        });
    };

    const onCancelRsvp = () => {
        startTransition(async () => {
            const res = await cancelRsvpAction(circleHandle, (event as any)._id?.toString?.() || "");
            if (res.success) {
                toast({ title: "RSVP cancelled" });
                router.refresh();
            } else {
                toast({ title: "Error", description: res.message || "Failed to cancel RSVP", variant: "destructive" });
            }
        });
    };

    const startFmt = event.startAt ? format(new Date(event.startAt), "PPpp") : "";
    const endFmt = event.endAt ? format(new Date(event.endAt), "PPpp") : "";

    // Stage control handlers
    const onSubmitForReview = () => {
        startTransition(async () => {
            const res = await changeEventStageAction(circleHandle, (event as any)._id?.toString?.() || "", "review");
            if (res.success) {
                toast({ title: "Event submitted for review" });
                router.refresh();
            } else {
                toast({ title: "Error", description: res.message || "Failed to submit", variant: "destructive" });
            }
        });
    };

    const onOpenNow = () => {
        startTransition(async () => {
            const res = await changeEventStageAction(circleHandle, (event as any)._id?.toString?.() || "", "open");
            if (res.success) {
                toast({ title: "Event opened" });
                router.refresh();
            } else {
                toast({ title: "Error", description: res.message || "Failed to open", variant: "destructive" });
            }
        });
    };

    const onCancelEvent = () => {
        startTransition(async () => {
            const res = await changeEventStageAction(circleHandle, (event as any)._id?.toString?.() || "", "cancelled");
            if (res.success) {
                toast({ title: "Event cancelled" });
                router.refresh();
            } else {
                toast({ title: "Error", description: res.message || "Failed to cancel", variant: "destructive" });
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className={`font-semibold ${compact ? "text-xl" : "text-2xl"}`}>{event.title}</h1>
                {!compact && (
                    <div className="flex gap-2">
                        <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
                            <Button variant="outline">Add to Google Calendar</Button>
                        </a>
                        {canEdit && (
                            <Button
                                variant="outline"
                                onClick={() =>
                                    router.push(
                                        `/circles/${circleHandle}/events/${(event as any)._id?.toString?.() || ""}/edit`,
                                    )
                                }
                            >
                                Edit
                            </Button>
                        )}
                    </div>
                )}

                {/* Stage controls */}
                <div
                    className={`flex flex-wrap items-center gap-3 rounded-md border bg-white/50 p-3 ${
                        compact ? "hidden" : ""
                    }`}
                >
                    <div className="text-sm text-muted-foreground">
                        Status: <span className="font-medium capitalize">{event.stage}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {event.stage === "draft" && (isAuthor || canReview) && (
                            <Button disabled={isPending} variant="secondary" onClick={onSubmitForReview}>
                                Submit for review
                            </Button>
                        )}
                        {(event.stage === "draft" || event.stage === "review") && canReview && (
                            <Button disabled={isPending} onClick={onOpenNow}>
                                Open
                            </Button>
                        )}
                        {event.stage === "open" && (canReview || canModerate) && (
                            <Button disabled={isPending} variant="destructive" onClick={onCancelEvent}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className={`grid gap-4 ${compact ? "grid-cols-1" : "md:grid-cols-3"}`}>
                <div className="space-y-4 md:col-span-2">
                    <div className="rounded-md border p-4">
                        <div className="text-sm text-muted-foreground">When</div>
                        <div className="font-medium">
                            {startFmt}
                            {endFmt ? ` — ${endFmt}` : ""}
                            {event.allDay ? " (All day)" : ""}
                        </div>
                    </div>

                    <div className="rounded-md border p-4">
                        <div className="text-sm text-muted-foreground">Where</div>
                        <div className="font-medium">
                            {event.isVirtual && event.virtualUrl ? (
                                <a className="text-blue-600 underline" href={event.virtualUrl} target="_blank">
                                    Join virtual event
                                </a>
                            ) : event.location ? (
                                <>
                                    {event.location.city || event.location.region || event.location.country
                                        ? [event.location.city, event.location.region, event.location.country]
                                              .filter(Boolean)
                                              .join(", ")
                                        : "Location provided"}
                                </>
                            ) : (
                                "Not specified"
                            )}
                            {event.isHybrid ? <div className="text-xs text-muted-foreground">Hybrid</div> : null}
                        </div>
                    </div>

                    <div className="rounded-md border p-4">
                        <div className="prose max-w-none whitespace-pre-wrap">{event.description}</div>
                    </div>

                    {event.images && event.images.length > 0 && (
                        compact ? (
                            <div className="grid grid-cols-1 gap-3">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    key={event.images[0].fileInfo.url}
                                    src={event.images[0].fileInfo.url}
                                    alt={event.title || "Event image"}
                                    className="h-40 w-full rounded-md object-cover"
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                {event.images.map((img, i) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        key={img.fileInfo.url + i}
                                        src={img.fileInfo.url}
                                        alt={event.title || "Event image"}
                                        className="h-40 w-full rounded-md object-cover"
                                    />
                                ))}
                            </div>
                        )
                    )}
                </div>

                <div className="space-y-3">
                    <div className="rounded-md border p-4">
                        <div className="mb-2 text-sm text-muted-foreground">RSVP</div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={isPending} onClick={() => onRsvp("going")}>
                                I'm going
                            </Button>
                            <Button size="sm" variant="outline" disabled={isPending} onClick={() => onRsvp("interested")}>
                                Interested
                            </Button>
                            <Button size="sm" variant="ghost" disabled={isPending} onClick={onCancelRsvp}>
                                Cancel RSVP
                            </Button>
                        </div>
                        <div className="mt-3 text-sm text-muted-foreground">
                            Attendees (going): {event.attendees ?? 0}
                        </div>
                        {event.userRsvpStatus && event.userRsvpStatus !== "none" && (
                            <div className="mt-1 text-sm">Your status: {event.userRsvpStatus}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

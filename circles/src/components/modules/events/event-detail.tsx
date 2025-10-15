"use client";

import React, { useState, useTransition } from "react";
import { EventDisplay } from "@/models/models";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { rsvpEventAction, cancelRsvpAction, changeEventStageAction } from "@/app/circles/[handle]/events/actions";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import ImageCarousel from "@/components/ui/image-carousel";
import { Calendar, MapPin, Clock } from "lucide-react";
import type { Circle, Media } from "@/models/models";
import InvitedUserList from "./invited-user-list";
import InviteModal from "./invite-modal";
import AttendeesList from "./attendees-list";
import RsvpDialog from "./rsvp-dialog";
import EventTasksPanel from "./event-tasks-panel";
import { CommentSection } from "../feeds/CommentSection";
import RichText from "../feeds/RichText";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

type Props = {
    circle?: Circle;
    circleHandle: string;
    event: EventDisplay;
    canEdit?: boolean;
    canReview?: boolean;
    canModerate?: boolean;
    isAuthor?: boolean;
    isPreview?: boolean;
};

function googleCalendarUrl(e: EventDisplay) {
    const formatGoogle = (d?: Date) => (d ? format(new Date(d), "yyyyMMdd'T'HHmmss") : "");
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
    circle,
    circleHandle,
    event,
    canEdit,
    canReview,
    canModerate,
    isAuthor,
    isPreview,
}: Props) {
    const { toast } = useToast();
    const [user] = useAtom(userAtom);
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isInviteModalOpen, setInviteModalOpen] = useState(false);
    const [isRsvpDialogOpen, setRsvpDialogOpen] = useState(false);
    const compact = !!isPreview;

    const start = event.startAt ? new Date(event.startAt as any) : null;
    const end = event.endAt ? new Date(event.endAt as any) : null;

    // Virtual join window: show Join button from 5 minutes before start until end (or 2h after start if no end)
    const isVirtual = !!(event.isVirtual && event.virtualUrl);
    const isCancelled = event.stage === "cancelled";
    const joinWindow = (() => {
        if (!start) return false;
        const now = new Date();
        const startMinus5 = new Date(start.getTime() - 5 * 60 * 1000);
        const endDt = end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);
        return now >= startMinus5 && now <= endDt;
    })();

    const locationText =
        event.isVirtual && event.virtualUrl
            ? ""
            : event.location
              ? [event.location.city, event.location.region, event.location.country].filter(Boolean).join(", ")
              : "";

    // Improved date formatting
    const now = new Date();
    const sameYear = start && start.getFullYear() === now.getFullYear();
    const fmt = sameYear ? "EEE, MMM d p" : "EEE, MMM d, yyyy p";
    const startFmt = start ? format(start, fmt) : "";
    const endFmt = end ? format(end, fmt) : "";

    const images: Media[] =
        event.images && event.images.length > 0
            ? event.images
            : [
                  {
                      name: "Default Cover",
                      type: "image/png",
                      fileInfo: { url: "/images/default-cover.png" },
                  } as Media,
              ];

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

    if (compact) {
        // Compact preview layout specialized for events
        return (
            <div className="space-y-3">
                <div className="relative h-[270px] w-full">
                    <ImageCarousel
                        images={images}
                        options={{ loop: images.length > 1 }}
                        containerClassName="h-full"
                        imageClassName="object-cover"
                        showArrows={false}
                        showDots={images.length > 1}
                        dotsPosition="bottom-right"
                    />
                    {start && (
                        <div className="absolute left-2 top-2 z-10 rounded-md bg-black/45 px-2 py-1 text-xs text-white md:text-sm">
                            {format(start, "MMM d")}
                        </div>
                    )}
                    {(locationText || event.isVirtual || event.isHybrid) && (
                        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs text-white">
                            <MapPin className="h-3 w-3" />
                            <span>
                                {event.isVirtual && !locationText ? "Virtual" : locationText}
                                {event.isHybrid ? " · Hybrid" : ""}
                            </span>
                        </div>
                    )}
                    <a
                        className="absolute bottom-2 right-2 z-10"
                        href={googleCalendarUrl(event)}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Button
                            size="icon"
                            variant="ghost"
                            className="rounded-full bg-black/30 text-white hover:bg-black/50"
                        >
                            <Calendar className="h-4 w-4" />
                        </Button>
                    </a>
                </div>

                <div className="px-4">
                    <h1 className="text-xl font-semibold">{event.title}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {/* {shortDateTimeRange && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {shortDateTimeRange}
                            </span>
                        )} */}
                        {(locationText || event.isVirtual || event.isHybrid) && (
                            <span className="inline-flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {event.isVirtual && !locationText ? "Virtual" : locationText}
                                {event.isHybrid ? " · Hybrid" : ""}
                            </span>
                        )}
                    </div>
                </div>

                <div className="px-4">
                    <div className="rounded-md border bg-white/60 p-3">
                        <div className="mb-2 text-xs text-muted-foreground">RSVP</div>
                        <div className="flex flex-wrap gap-2">
                            {event.userRsvpStatus === "going" ? (
                                <>
                                    <Button size="sm" variant="destructive" disabled={isPending} onClick={onCancelRsvp}>
                                        Cancel RSVP
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => onRsvp("interested")}
                                    >
                                        Interested
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button size="sm" disabled={isPending} onClick={() => setRsvpDialogOpen(true)}>
                                        I&apos;m going
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => onRsvp("interested")}
                                    >
                                        Interested
                                    </Button>
                                </>
                            )}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                            Attendees (going): {event.attendees ?? 0}
                        </div>
                        {event.userRsvpStatus && event.userRsvpStatus !== "none" && (
                            <div className="mt-1 text-xs">Your status: {event.userRsvpStatus}</div>
                        )}
                    </div>
                </div>

                {event.description && (
                    <div className="px-4">
                        <div className="rounded-md border bg-white/50 p-3">
                            <div className="prose max-h-40 max-w-none overflow-hidden">
                                <RichText content={event.description} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="px-4">
                    <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() =>
                            router.push(`/circles/${circleHandle}/events/${(event as any)._id?.toString?.() || ""}`)
                        }
                    >
                        Open Event
                    </Button>
                </div>

                <InviteModal
                    circleHandle={circleHandle}
                    eventId={event._id!.toString()}
                    open={isInviteModalOpen}
                    onOpenChange={setInviteModalOpen}
                />
                <RsvpDialog
                    circleHandle={circleHandle}
                    eventId={event._id!.toString()}
                    open={isRsvpDialogOpen}
                    onOpenChange={setRsvpDialogOpen}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Cover image */}
            {event.images && event.images.length > 0 && (
                <div className="relative h-64 w-full md:h-80">
                    <ImageCarousel
                        images={images}
                        options={{ loop: images.length > 1 }}
                        containerClassName="h-full"
                        imageClassName="object-cover rounded-md"
                        showArrows={images.length > 1}
                        showDots={images.length > 1}
                        dotsPosition="bottom-right"
                    />
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    {/* Happening now / upcoming label */}
                    {start && end && now >= start && now <= end && (
                        <div className="mb-1 text-sm font-medium text-green-600">Happening now</div>
                    )}
                    {start && now < start && <div className="mb-1 text-sm font-medium text-blue-600">Upcoming</div>}
                    <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {startFmt && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {endFmt ? `${startFmt} — ${endFmt}` : startFmt}
                            </span>
                        )}
                        {(locationText || event.isVirtual || event.isHybrid) && (
                            <span className="inline-flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {event.isVirtual && !locationText ? "Virtual" : locationText}
                                {event.isHybrid ? " · Hybrid" : ""}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
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
                    {event.stage === "open" && <Button onClick={() => setInviteModalOpen(true)}>Invite</Button>}
                </div>
            </div>

            {/* Stage controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white/70 p-4 shadow-sm">
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

            <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-6 md:col-span-2">
                    <div className="rounded-lg border bg-white/70 p-5 shadow-sm">
                        <div className="mb-1 text-sm font-medium text-muted-foreground">When</div>
                        <div className="text-base font-semibold">
                            {startFmt}
                            {endFmt ? ` — ${endFmt}` : ""}
                            {event.allDay ? " (All day)" : ""}
                        </div>
                    </div>

                    <div className="rounded-lg border bg-white/70 p-5 shadow-sm">
                        <div className="mb-1 text-sm font-medium text-muted-foreground">Where</div>
                        <div className="text-base font-semibold">
                            {event.isVirtual && event.virtualUrl ? (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            className={
                                                joinWindow && !isCancelled
                                                    ? "bg-green-600 text-white hover:bg-green-700"
                                                    : "bg-gray-200 text-gray-700 hover:bg-gray-200"
                                            }
                                            onClick={() => {
                                                if (joinWindow && !isCancelled) {
                                                    window.open(event.virtualUrl!, "_blank", "noopener,noreferrer");
                                                } else {
                                                    const mins = start
                                                        ? Math.max(
                                                              0,
                                                              Math.ceil(
                                                                  (start.getTime() - new Date().getTime()) / 60000,
                                                              ),
                                                          )
                                                        : 0;
                                                    toast({
                                                        title: "Join unavailable",
                                                        description: `Event can be joined when it starts in ${mins} minute${
                                                            mins === 1 ? "" : "s"
                                                        }.`,
                                                    });
                                                }
                                            }}
                                        >
                                            Join
                                        </Button>
                                    </div>
                                    <a
                                        className="break-all text-blue-600 underline"
                                        href={event.virtualUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {event.virtualUrl}
                                    </a>
                                </div>
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

                    {event.description && (
                        <div className="rounded-lg border bg-white/70 p-5 shadow-sm">
                            <div className="prose max-w-none">
                                <RichText content={event.description} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="rounded-lg border bg-white/70 p-5 shadow-sm">
                        <div className="mb-2 text-sm font-medium text-muted-foreground">RSVP</div>
                        <div className="flex flex-wrap gap-2">
                            {event.userRsvpStatus === "going" ? (
                                <>
                                    <Button size="sm" variant="destructive" disabled={isPending} onClick={onCancelRsvp}>
                                        Cancel RSVP
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => onRsvp("interested")}
                                    >
                                        Interested
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button size="sm" disabled={isPending} onClick={() => setRsvpDialogOpen(true)}>
                                        I&apos;m going
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => onRsvp("interested")}
                                    >
                                        Interested
                                    </Button>
                                </>
                            )}
                        </div>
                        <div className="mt-3 text-sm text-muted-foreground">
                            Attendees (going): {event.attendees ?? 0}
                        </div>
                        {event.userRsvpStatus && event.userRsvpStatus !== "none" && (
                            <div className="mt-1 text-sm">Your status: {event.userRsvpStatus}</div>
                        )}
                    </div>
                    <AttendeesList circleHandle={circleHandle} eventId={event._id!.toString()} />
                    {event.invitations && event.invitations.length > 0 && (
                        <InvitedUserList
                            userDids={event.invitations}
                            circleHandle={circleHandle}
                            eventId={event._id!.toString()}
                        />
                    )}
                    <EventTasksPanel circleHandle={circleHandle} eventId={event._id!.toString()} />
                </div>
            </div>

            <InviteModal
                circleHandle={circleHandle}
                eventId={event._id!.toString()}
                open={isInviteModalOpen}
                onOpenChange={setInviteModalOpen}
            />
            <RsvpDialog
                circleHandle={circleHandle}
                eventId={event._id!.toString()}
                open={isRsvpDialogOpen}
                onOpenChange={setRsvpDialogOpen}
            />

            {event.commentPostId ? (
                <CommentSection postId={event.commentPostId} circle={circle!} user={user ?? null} />
            ) : (
                <div className="text-sm text-gray-500">Comments are not available for this event.</div>
            )}
        </div>
    );
}

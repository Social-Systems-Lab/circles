"use client";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction, updateEventAction } from "@/app/circles/[handle]/events/actions";
import {
    Circle,
    EventDisplay,
    Location,
    Media,
    PeerifyEventAccessMode,
    PeerifyEventLocationDisclosure,
    PeerifyEventVenueDisclosure,
} from "@/models/models";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import LocationPicker from "@/components/forms/location-picker";
import TimePicker from "@/components/forms/time-picker";
import { format, addHours, setHours, setMinutes } from "date-fns";
import { Bold, Italic, List, Link as LinkIcon, Heading1, Heading2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
    circleHandle?: string; // optional, can come from context or picker
    event?: EventDisplay | null;
    showCirclePicker?: boolean;
    initialSelectedCircleId?: string;
};

function toISOStringLocal(date: Date) {
    // Convert to yyyy-MM-ddTHH:mm for input[type=datetime-local]
    const pad = (n: number) => `${n}`.padStart(2, "0");
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}-${m}-${d}T${h}:${min}`;
}

function formatDate(date: Date) {
    return format(date, "yyyy-MM-dd");
}

function formatTime(date: Date) {
    return format(date, "HH:mm");
}

function toUtcEndOfDayIso(dateOnly: string) {
    return `${dateOnly}T23:59:59.999Z`;
}

import CircleSelector from "@/components/global-create/circle-selector";
import { CreatableItemDetail, creatableItemsList } from "@/components/global-create/global-create-dialog-content";

const VENUE_DISCLOSURE_OPTIONS: Array<{
    value: PeerifyEventVenueDisclosure;
    label: string;
    helper: string;
}> = [
    {
        value: "public",
        label: "Show venue / host",
        helper: "Show the venue, host, or event place publicly.",
    },
    {
        value: "venue_to_be_disclosed",
        label: "Venue to be announced",
        helper: "Use this when the event is public, but the venue has not been chosen or confirmed yet.",
    },
    {
        value: "secret_after_acceptance",
        label: "Hide venue / host until accepted",
        helper: "Hide the venue or host publicly until approval, ticket purchase, or invite acceptance later.",
    },
    {
        value: "one_off_location",
        label: "One-off location, no venue profile",
        helper: "Use this for a pop-up or living-room event that does not need a reusable Venue profile.",
    },
];

const LOCATION_DISCLOSURE_OPTIONS: Array<{
    value: PeerifyEventLocationDisclosure;
    label: string;
    helper: string;
}> = [
    {
        value: "public",
        label: "Show exact address and map pin",
        helper: "The public event page may show the saved address and exact map pin.",
    },
    {
        value: "approximate",
        label: "Show approximate area only",
        helper: "Show only city or area publicly. The exact address and pin are hidden from public views.",
    },
    {
        value: "secret_after_acceptance",
        label: "Reveal address after acceptance",
        helper: "Show a public label now; reveal the exact address later to approved, ticketed, or invited attendees.",
    },
    {
        value: "to_be_disclosed",
        label: "Address to be announced",
        helper: "Use this when the address is not yet chosen or should not be shown yet.",
    },
];

const ACCESS_MODE_OPTIONS: Array<{
    value: PeerifyEventAccessMode;
    label: string;
    helper: string;
}> = [
    {
        value: "open_rsvp",
        label: "Open RSVP",
        helper: "People can RSVP normally.",
    },
    {
        value: "approval_required",
        label: "Approval required",
        helper: "People can request to attend. Approval workflow will be wired later.",
    },
    {
        value: "ticket_required",
        label: "Ticket required",
        helper: "Use for ticketed events. Ticketing will be wired later.",
    },
    {
        value: "invite_only",
        label: "Invite only",
        helper: "Attendance is restricted to invited people.",
    },
];

function getSelectedHelper<T extends string>(options: Array<{ value: T; helper: string }>, value: T) {
    return options.find((option) => option.value === value)?.helper;
}

export default function EventForm({ circleHandle, event, showCirclePicker, initialSelectedCircleId }: Props) {
    console.log("EventForm mounted/updated. Event recurrence:", event?.recurrence);
    const [selectedCircle, setSelectedCircle] = useState<string | undefined>(circleHandle);
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === "event");

    const [title, setTitle] = useState(event?.title || "");
    const [description, setDescription] = useState(event?.description || "");
    const [isVirtual, setIsVirtual] = useState<boolean>(!!event?.isVirtual);
    const [isHybrid, setIsHybrid] = useState<boolean>(!!event?.isHybrid);
    const [virtualUrl, setVirtualUrl] = useState<string>(event?.virtualUrl || "");
    const [allDay, setAllDay] = useState<boolean>(!!event?.allDay);
    const [capacity, setCapacity] = useState<string>(event?.capacity ? String(event.capacity) : "");
    const [isPrivate, setIsPrivate] = useState<boolean>(event?.visibility === "private");
    const [location, setLocation] = useState<Location | undefined>(event?.location);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [publishToNoticeboard, setPublishToNoticeboard] = useState<boolean>(Boolean(event?.noticeboardPostId));
    const peerifyMetadata = event?.metadata?.peerify;
    const [venueDisclosure, setVenueDisclosure] = useState<PeerifyEventVenueDisclosure>(
        peerifyMetadata?.venueDisclosure || "public",
    );
    const [locationDisclosure, setLocationDisclosure] = useState<PeerifyEventLocationDisclosure>(
        peerifyMetadata?.locationDisclosure || "public",
    );
    const [accessMode, setAccessMode] = useState<PeerifyEventAccessMode>(peerifyMetadata?.accessMode || "open_rsvp");
    const [publicLocationLabel, setPublicLocationLabel] = useState<string>(peerifyMetadata?.publicLocationLabel || "");
    const [privateLocationNote, setPrivateLocationNote] = useState<string>(peerifyMetadata?.privateLocationNote || "");
    const [publicMapLocation, setPublicMapLocation] = useState<Location | undefined>(
        peerifyMetadata?.publicMapLocation,
    );

    // Recurrence State
    const [isRecurring, setIsRecurring] = useState<boolean>(!!event?.recurrence);
    const [recurrenceFreq, setRecurrenceFreq] = useState<"daily" | "weekly" | "monthly" | "yearly">(
        event?.recurrence?.frequency || "daily",
    );
    const [recurrenceInterval, setRecurrenceInterval] = useState<string>(
        event?.recurrence?.interval ? String(event?.recurrence.interval) : "1",
    );
    const [recurrenceEndMode, setRecurrenceEndMode] = useState<"date" | "count">(
        event?.recurrence?.count ? "count" : "date",
    );
    const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>(
        event?.recurrence?.endDate
            ? formatDate(new Date(event.recurrence.endDate))
            : formatDate(addHours(new Date(), 24 * 7)), // Default to one week later
    );
    const [recurrenceCount, setRecurrenceCount] = useState<string>(
        event?.recurrence?.count ? String(event.recurrence.count) : "7",
    );

    const [startDate, setStartDate] = useState(() =>
        event?.startAt ? formatDate(new Date(event.startAt)) : format(new Date(), "yyyy-MM-dd"),
    );
    const [endDate, setEndDate] = useState(() =>
        event?.endAt ? formatDate(new Date(event.endAt)) : formatDate(new Date()),
    );
    const [startTime, setStartTime] = useState(() => (event?.startAt ? formatTime(new Date(event.startAt)) : "12:00"));
    const [endTime, setEndTime] = useState(() => (event?.endAt ? formatTime(new Date(event.endAt)) : "13:00"));
    const [endDirty, setEndDirty] = useState(false);
    const [startDirty, setStartDirty] = useState(false);
    const seededRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertMarkdown = (prefix: string, suffix: string = "") => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = description;
        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end);

        const newText = before + prefix + selection + suffix + after;
        setDescription(newText);

        // Restore focus and selection
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + prefix.length + selection.length + suffix.length;
            textarea.setSelectionRange(
                start + prefix.length,
                selection.length ? start + prefix.length + selection.length : start + prefix.length,
            );
        }, 0);
    };

    useEffect(() => {
        if (allDay) return;

        // Only auto-sync when user changed start fields and end hasn't been manually edited
        if (!startDirty || endDirty) return;

        const [h, m] = startTime.split(":").map(Number);
        const newStart = setMinutes(setHours(new Date(startDate), h), m);
        const newEnd = addHours(newStart, 1);

        setEndDate(formatDate(newEnd));
        setEndTime(formatTime(newEnd));
    }, [startTime, startDate, allDay, startDirty, endDirty]);

    // Seed date/time from event once when it becomes available
    useEffect(() => {
        if (!event || seededRef.current) return;
        if (event.startAt) {
            const sd = new Date(event.startAt as any);
            setStartDate(formatDate(sd));
            setStartTime(formatTime(sd));
        }
        if (event.endAt) {
            const ed = new Date(event.endAt as any);
            setEndDate(formatDate(ed));
            setEndTime(formatTime(ed));
        }
        seededRef.current = true;
    }, [event]);

    // Seed images for edit
    useEffect(() => {
        if (event?.images?.length) {
            const initial = event.images.map((media) => ({
                id: media.fileInfo.url,
                preview: media.fileInfo.url,
                existingMediaUrl: media.fileInfo.url,
            }));
            setImages(initial);
        }
    }, [event?.images]);

    useEffect(() => {
        setPublishToNoticeboard(Boolean(event?.noticeboardPostId));
    }, [event?.noticeboardPostId]);

    const handleImagesChange = (items: ImageItem[]) => setImages(items);
    const handleCircleSelected = useCallback((circle: Circle | null) => {
        setSelectedCircle(circle?.handle);
    }, []);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Basic client checks
        if (!title || !description) {
            toast({ title: "Validation", description: "Title and description are required.", variant: "destructive" });
            return;
        }
        if (!startDate || !endDate || (!allDay && (!startTime || !endTime))) {
            toast({
                title: "Validation",
                description: "Start and end date and time are required.",
                variant: "destructive",
            });
            return;
        }

        if (!selectedCircle) {
            toast({
                title: "Validation",
                description: "Please select a profile or circle.",
                variant: "destructive",
            });
            return;
        }

        startTransition(async () => {
            try {
                const fd = new FormData();
                fd.set("title", title);
                fd.set("description", description);

                // Append images: files or existing JSON
                for (const item of images) {
                    if (item.file) {
                        fd.append("images", item.file);
                    } else if (item.existingMediaUrl) {
                        // Minimal Media JSON so server can keep existing
                        const existingMedia: Media = {
                            name: "image",
                            type: "image",
                            fileInfo: { url: item.existingMediaUrl },
                        } as any;
                        fd.append("images", JSON.stringify(existingMedia));
                    }
                }

                if (location) {
                    fd.set("location", JSON.stringify(location));
                }

                fd.set("isVirtual", isVirtual ? "on" : "");
                fd.set("isHybrid", isHybrid ? "on" : "");
                if (virtualUrl) fd.set("virtualUrl", virtualUrl);

                const finalStart = allDay ? new Date(startDate) : new Date(`${startDate}T${startTime}`);
                const finalEnd = allDay ? new Date(endDate) : new Date(`${endDate}T${endTime}`);

                fd.set("startAt", finalStart.toISOString());
                fd.set("endAt", finalEnd.toISOString());
                fd.set("allDay", allDay ? "on" : "");
                if (capacity) fd.set("capacity", capacity);
                fd.set("visibility", isPrivate ? "private" : "public");
                fd.set(
                    "peerifyEventMetadata",
                    JSON.stringify({
                        venueDisclosure,
                        locationDisclosure,
                        accessMode,
                        publicLocationLabel: publicLocationLabel.trim(),
                        privateLocationNote: privateLocationNote.trim(),
                        publicMapLocation: publicMapLocation ?? null,
                    }),
                );

                if (isRecurring) {
                    const recurrenceData = {
                        frequency: recurrenceFreq,
                        interval: parseInt(recurrenceInterval) || 1,
                        endDate: recurrenceEndMode === "date" ? toUtcEndOfDayIso(recurrenceEndDate) : undefined,
                        count: recurrenceEndMode === "count" ? parseInt(recurrenceCount) : undefined,
                    };
                    fd.set("recurrence", JSON.stringify(recurrenceData));
                } else {
                    fd.set("recurrence", "");
                }
                fd.set("publishToNoticeboard", String(publishToNoticeboard));

                let result: { success: boolean; message?: string; eventId?: string };
                if (event?._id) {
                    result = await updateEventAction(selectedCircle, event._id as string, fd);
                } else {
                    result = await createEventAction(selectedCircle, fd);
                }

                if (result.success) {
                    toast({
                        title: "Success",
                        description: result.message || (event ? "Event updated." : "Event created."),
                    });
                    if (!event && result.eventId) {
                        router.push(`/circles/${selectedCircle}/events/${result.eventId}`);
                    } else {
                        router.push(`/circles/${selectedCircle}/events`);
                    }
                    router.refresh();
                } else {
                    toast({
                        title: "Error",
                        description: result.message || "Failed to save event",
                        variant: "destructive",
                    });
                }
            } catch (err) {
                console.error(err);
                toast({ title: "Error", description: "Failed to save event", variant: "destructive" });
            }
        });
    };

    return (
        <form className="space-y-6" onSubmit={onSubmit}>
            {showCirclePicker && itemDetail && (
                <div>
                    <CircleSelector
                        itemType={itemDetail}
                        onCircleSelected={handleCircleSelected}
                        initialSelectedCircleId={initialSelectedCircleId}
                        showModuleEnableMessage={false}
                    />
                </div>
            )}
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="title">Title</Label>
                        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <div className="mb-2 flex items-center gap-1 rounded-md border bg-gray-50 p-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => insertMarkdown("**", "**")}
                                title="Bold"
                            >
                                <Bold className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => insertMarkdown("*", "*")}
                                title="Italic"
                            >
                                <Italic className="h-4 w-4" />
                            </Button>
                            <div className="mx-1 h-4 w-px bg-gray-300" />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => insertMarkdown("- ")}
                                title="List"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => insertMarkdown("[", "](url)")}
                                title="Link"
                            >
                                <LinkIcon className="h-4 w-4" />
                            </Button>
                            <div className="mx-1 h-4 w-px bg-gray-300" />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => insertMarkdown("# ")}
                                title="Heading 1"
                            >
                                <Heading1 className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => insertMarkdown("## ")}
                                title="Heading 2"
                            >
                                <Heading2 className="h-4 w-4" />
                            </Button>
                        </div>
                        <Textarea
                            id="description"
                            ref={textareaRef}
                            className="min-h-[140px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Start Date</Label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setStartDirty(true);
                                }}
                            />
                        </div>
                        {!allDay && (
                            <div>
                                <Label>Start Time</Label>
                                <TimePicker
                                    value={startTime}
                                    onChange={(val) => {
                                        setStartTime(val);
                                        setStartDirty(true);
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {!isRecurring && (
                            <div>
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => {
                                        setEndDate(e.target.value);
                                        setEndDirty(true);
                                    }}
                                />
                            </div>
                        )}
                        {!allDay && (
                            <div>
                                <Label>End Time</Label>
                                <TimePicker
                                    value={endTime}
                                    onChange={(val) => {
                                        setEndTime(val);
                                        setEndDirty(true);
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch id="allDay" checked={allDay} onCheckedChange={setAllDay} />
                        <Label htmlFor="allDay">All day</Label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                            <Switch id="isVirtual" checked={isVirtual} onCheckedChange={setIsVirtual} />
                            <Label htmlFor="isVirtual">Virtual</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="isHybrid" checked={isHybrid} onCheckedChange={setIsHybrid} />
                            <Label htmlFor="isHybrid">Hybrid</Label>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isRecurring"
                                checked={isRecurring}
                                onCheckedChange={(checked) => {
                                    setIsRecurring(checked);
                                    if (checked) {
                                        // Reset end date to start date to avoid multi-day recurrence confusion
                                        setEndDate(startDate);
                                        if (!recurrenceFreq) {
                                            setRecurrenceFreq("daily");
                                            setRecurrenceInterval("1");
                                            setRecurrenceEndMode("date");
                                            setRecurrenceEndDate(endDate);
                                        }
                                    }
                                }}
                            />
                            <Label htmlFor="isRecurring" className="font-medium">
                                Recurring meeting
                            </Label>
                        </div>

                        {isRecurring && (
                            <div className="grid gap-4 pl-6 pt-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Recurrence</Label>
                                        <Select
                                            value={recurrenceFreq}
                                            onValueChange={(val) => setRecurrenceFreq(val as any)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="daily">Daily</SelectItem>
                                                <SelectItem value="weekly">Weekly</SelectItem>
                                                <SelectItem value="monthly">Monthly</SelectItem>
                                                <SelectItem value="yearly">Yearly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Repeat every</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min="1"
                                                value={recurrenceInterval}
                                                onChange={(e) => setRecurrenceInterval(e.target.value)}
                                            />
                                            <span className="text-sm text-muted-foreground">
                                                {recurrenceFreq === "daily"
                                                    ? "day(s)"
                                                    : recurrenceFreq === "weekly"
                                                      ? "week(s)"
                                                      : recurrenceFreq === "monthly"
                                                        ? "month(s)"
                                                        : "year(s)"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>End Date</Label>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border ${
                                                    recurrenceEndMode === "date"
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : "border-input"
                                                }`}
                                                onClick={() => setRecurrenceEndMode("date")}
                                            >
                                                {recurrenceEndMode === "date" && (
                                                    <div className="h-2 w-2 rounded-full bg-white" />
                                                )}
                                            </div>
                                            <Label
                                                className="cursor-pointer font-normal"
                                                onClick={() => setRecurrenceEndMode("date")}
                                            >
                                                By
                                            </Label>
                                            <Input
                                                type="date"
                                                disabled={recurrenceEndMode !== "date"}
                                                value={recurrenceEndDate}
                                                onChange={(e) => setRecurrenceEndDate(e.target.value)}
                                                className="w-40"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border ${
                                                    recurrenceEndMode === "count"
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : "border-input"
                                                }`}
                                                onClick={() => setRecurrenceEndMode("count")}
                                            >
                                                {recurrenceEndMode === "count" && (
                                                    <div className="h-2 w-2 rounded-full bg-white" />
                                                )}
                                            </div>
                                            <Label
                                                className="cursor-pointer font-normal"
                                                onClick={() => setRecurrenceEndMode("count")}
                                            >
                                                After
                                            </Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                disabled={recurrenceEndMode !== "count"}
                                                value={recurrenceCount}
                                                onChange={(e) => setRecurrenceCount(e.target.value)}
                                                className="w-20"
                                            />
                                            <span className="text-sm text-muted-foreground">occurrences</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {isVirtual && (
                        <div>
                            <Label htmlFor="virtualUrl">Virtual URL</Label>
                            <Input
                                id="virtualUrl"
                                type="url"
                                placeholder="https://meet.example.com/..."
                                value={virtualUrl}
                                onChange={(e) => setVirtualUrl(e.target.value)}
                            />
                        </div>
                    )}

                    <div>
                        <Label htmlFor="capacity">Capacity (optional)</Label>
                        <Input
                            id="capacity"
                            type="number"
                            inputMode="numeric"
                            placeholder="e.g., 50"
                            value={capacity}
                            onChange={(e) => setCapacity(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch id="isPrivate" checked={isPrivate} onCheckedChange={setIsPrivate} />
                        <Label htmlFor="isPrivate">{isPrivate ? "Private event" : "Public event"}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {isPrivate
                            ? "Invite-only or unlisted. Not shown publicly."
                            : "Listed publicly when the event is open."}
                    </p>

                    <div className="rounded-lg border p-4">
                        <div className="flex items-start gap-3">
                            <Checkbox
                                id="publishToNoticeboard"
                                checked={publishToNoticeboard}
                                onCheckedChange={(checked) => setPublishToNoticeboard(Boolean(checked))}
                            />
                            <div className="space-y-1">
                                <Label htmlFor="publishToNoticeboard">Share this event on the Noticeboard</Label>
                                <p className="text-sm text-muted-foreground">
                                    Create or update one linked Noticeboard post for this event.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <Label>Images</Label>
                        <MultiImageUploader initialImages={event?.images || []} onChange={handleImagesChange} />
                    </div>

                    <div>
                        <Label htmlFor="location">Location</Label>
                        <LocationPicker value={location} onChange={(val) => setLocation(val)} compact />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Set the event location. For online events, toggle &quot;Virtual&quot; above.
                        </p>
                    </div>

                    <div className="space-y-4 rounded-lg border p-4">
                        <div>
                            <h3 className="text-sm font-medium">Venue & location privacy</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Choose what people can see before they are accepted, ticketed, or invited. Venue / host
                                display controls the name or identity of the place. Address & map display controls the
                                exact address and map pin.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="venueDisclosure">Venue / host display</Label>
                            <Select
                                value={venueDisclosure}
                                onValueChange={(value) => setVenueDisclosure(value as PeerifyEventVenueDisclosure)}
                            >
                                <SelectTrigger id="venueDisclosure">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {VENUE_DISCLOSURE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {getSelectedHelper(VENUE_DISCLOSURE_OPTIONS, venueDisclosure)}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="locationDisclosure">Address & map display</Label>
                            <Select
                                value={locationDisclosure}
                                onValueChange={(value) =>
                                    setLocationDisclosure(value as PeerifyEventLocationDisclosure)
                                }
                            >
                                <SelectTrigger id="locationDisclosure">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {LOCATION_DISCLOSURE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {getSelectedHelper(LOCATION_DISCLOSURE_OPTIONS, locationDisclosure)}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="accessMode">Access mode</Label>
                            <Select
                                value={accessMode}
                                onValueChange={(value) => setAccessMode(value as PeerifyEventAccessMode)}
                            >
                                <SelectTrigger id="accessMode">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACCESS_MODE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {getSelectedHelper(ACCESS_MODE_OPTIONS, accessMode)}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="publicLocationLabel">Public area / address label</Label>
                            <Input
                                id="publicLocationLabel"
                                value={publicLocationLabel}
                                onChange={(e) => setPublicLocationLabel(e.target.value)}
                                placeholder="Stockholm venue TBA"
                            />
                            <p
                                className={`text-xs ${
                                    locationDisclosure === "public"
                                        ? "text-muted-foreground"
                                        : "font-medium text-muted-foreground"
                                }`}
                            >
                                Shown publicly when the exact address is approximate, secret, or to be announced.
                                Examples: Cape Town city bowl, Stockholm venue TBA, or Address shared after approval.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Public map area</Label>
                            <LocationPicker
                                value={publicMapLocation}
                                onChange={(val) => setPublicMapLocation(val)}
                                compact
                            />
                            <p
                                className={`text-xs ${
                                    locationDisclosure === "public" && venueDisclosure !== "venue_to_be_disclosed"
                                        ? "text-muted-foreground"
                                        : "font-medium text-muted-foreground"
                                }`}
                            >
                                Optional safe map point for discovery when the exact venue or address is hidden,
                                approximate, or to be announced. This should be a general area, not a private address.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="privateLocationNote">Private organiser note</Label>
                            <Textarea
                                id="privateLocationNote"
                                value={privateLocationNote}
                                onChange={(e) => setPrivateLocationNote(e.target.value)}
                                className="min-h-[90px]"
                                placeholder="Internal organiser note"
                            />
                            <p className="text-xs text-muted-foreground">
                                Internal note about the exact address, access instructions, or reveal conditions. This
                                is not shown publicly.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-3">
                <Button type="submit" disabled={isPending}>
                    {isPending ? "Saving..." : event ? "Update Event" : "Create Draft"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

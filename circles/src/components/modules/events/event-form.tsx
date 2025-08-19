"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createEventAction, updateEventAction } from "@/app/circles/[handle]/events/actions";
import { EventDisplay, Location, Media } from "@/models/models";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

type Props = {
    circleHandle: string;
    event?: EventDisplay | null;
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

export default function EventForm({ circleHandle, event }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const [title, setTitle] = useState(event?.title || "");
    const [description, setDescription] = useState(event?.description || "");
    const [isVirtual, setIsVirtual] = useState<boolean>(!!event?.isVirtual);
    const [isHybrid, setIsHybrid] = useState<boolean>(!!event?.isHybrid);
    const [virtualUrl, setVirtualUrl] = useState<string>(event?.virtualUrl || "");
    const [allDay, setAllDay] = useState<boolean>(!!event?.allDay);
    const [capacity, setCapacity] = useState<string>(event?.capacity ? String(event.capacity) : "");
    const [location, setLocation] = useState<Location | undefined>(event?.location);
    const [images, setImages] = useState<ImageItem[]>([]);

    // Prefill from URL if creating
    const initialStart = useMemo(() => {
        if (event?.startAt) return toISOStringLocal(new Date(event.startAt));
        const qs = searchParams?.get("startAt");
        return qs ? toISOStringLocal(new Date(qs)) : "";
    }, [event?.startAt, searchParams]);

    const initialEnd = useMemo(() => {
        if (event?.endAt) return toISOStringLocal(new Date(event.endAt));
        const qs = searchParams?.get("endAt");
        return qs ? toISOStringLocal(new Date(qs)) : "";
    }, [event?.endAt, searchParams]);

    const [startAt, setStartAt] = useState<string>(initialStart);
    const [endAt, setEndAt] = useState<string>(initialEnd);

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

    const handleImagesChange = (items: ImageItem[]) => setImages(items);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Basic client checks
        if (!title || !description) {
            toast({ title: "Validation", description: "Title and description are required.", variant: "destructive" });
            return;
        }
        if (!startAt || !endAt) {
            toast({ title: "Validation", description: "Start and end time are required.", variant: "destructive" });
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

                fd.set("startAt", new Date(startAt).toISOString());
                fd.set("endAt", new Date(endAt).toISOString());
                fd.set("allDay", allDay ? "on" : "");
                if (capacity) fd.set("capacity", capacity);

                let result: { success: boolean; message?: string; eventId?: string };
                if (event?._id) {
                    result = await updateEventAction(circleHandle, event._id as string, fd);
                } else {
                    result = await createEventAction(circleHandle, fd);
                }

                if (result.success) {
                    toast({
                        title: "Success",
                        description: result.message || (event ? "Event updated." : "Event created."),
                    });
                    if (!event && result.eventId) {
                        router.push(`/circles/${circleHandle}/events/${result.eventId}`);
                    } else {
                        router.push(`/circles/${circleHandle}/events`);
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
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="title">Title</Label>
                        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            className="min-h-[140px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="startAt">Start</Label>
                            <Input
                                id="startAt"
                                type="datetime-local"
                                value={startAt}
                                onChange={(e) => setStartAt(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="endAt">End</Label>
                            <Input
                                id="endAt"
                                type="datetime-local"
                                value={endAt}
                                onChange={(e) => setEndAt(e.target.value)}
                                required
                            />
                        </div>
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
                </div>

                <div className="space-y-4">
                    <div>
                        <Label>Images</Label>
                        <MultiImageUploader initialImages={event?.images || []} onChange={handleImagesChange} />
                    </div>

                    <div>
                        <Label htmlFor="location">Location JSON (temporary)</Label>
                        <Textarea
                            id="location"
                            className="min-h-[120px]"
                            placeholder='{"precision": 1, "city":"Stockholm"}'
                            defaultValue={location ? JSON.stringify(location, null, 2) : ""}
                            onChange={(e) => {
                                try {
                                    const val = e.target.value.trim();
                                    setLocation(val ? (JSON.parse(val) as Location) : undefined);
                                } catch {
                                    // ignore until submit
                                }
                            }}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Temporary field for MVP. Will be replaced by a proper location picker.
                        </p>
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

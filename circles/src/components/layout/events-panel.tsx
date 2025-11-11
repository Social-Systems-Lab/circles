"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Clock, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { ListFilter } from "@/components/utils/list-filter";
import { getOpenEventsForListAction } from "@/components/modules/circles/map-explorer-actions";
import type { EventDisplay, Cause as SDG } from "@/models/models";

function fmtRange(startAt?: Date | string, endAt?: Date | string, allDay?: boolean): string {
    if (!startAt || !endAt) return "";
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (allDay) {
        const sameDay =
            s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
        if (sameDay) return format(s, "EEE, MMM d, yyyy");
        return `${format(s, "EEE, MMM d")} - ${format(e, "EEE, MMM d, yyyy")}`;
    }
    const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
    if (sameDay) return `${format(s, "EEE, MMM d, yyyy • p")} - ${format(e, "p")}`;
    return `${format(s, "EEE, MMM d, yyyy • p")} - ${format(e, "EEE, MMM d, yyyy • p")}`;
}

function haversineKm(a?: [number, number], b?: [number, number]) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const [lng1, lat1] = a;
    const [lng2, lat2] = b;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLon / 2);
    const aa = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
}

const EventRow: React.FC<{ e: EventDisplay }> = ({ e }) => {
    const attendees = e.attendees ?? 0;
    const locationString = (() => {
        if (e.isVirtual) return "Online";
        const loc: any = e.location || {};
        const parts = [loc.street, loc.city, loc.region, loc.country].filter(Boolean) as string[];
        return parts.length ? parts.join(", ") : undefined;
    })();
    const href = e?.circle?.handle && (e as any)._id ? `/circles/${e.circle!.handle}/events/${(e as any)._id}` : "#";

    return (
        <Link href={href} className="group block">
            <Card className="relative transition-shadow hover:shadow-sm">
                <CardContent className="flex items-start gap-3 p-3">
                    {e.images?.[0]?.fileInfo?.url && (
                        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded border">
                            <Image
                                src={e.images[0].fileInfo.url}
                                alt={e.title || "Event"}
                                fill
                                sizes="64px"
                                className="object-cover"
                            />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                            <div className="truncate text-[15px] font-semibold group-hover:text-primary">
                                {e.title || "Untitled"}
                            </div>
                            {e.stage === "cancelled" && (
                                <Badge variant="outline" className="border-red-400 bg-red-100 text-xs text-red-800">
                                    Cancelled
                                </Badge>
                            )}
                            {e.stage === "review" && (
                                <Badge
                                    variant="outline"
                                    className="border-yellow-400 bg-yellow-100 text-xs text-yellow-800"
                                >
                                    <Clock className="mr-1 h-3 w-3" />
                                    Review
                                </Badge>
                            )}
                        </div>
                        <div className="mb-0.5 flex items-center text-xs text-muted-foreground">
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {fmtRange(e.startAt, e.endAt, e.allDay)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {locationString && (
                                <span className="inline-flex items-center">
                                    <MapPin className="mr-1 h-3 w-3" />
                                    {locationString}
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

export default function EventsPanel() {
    const [user] = useAtom(userAtom);
    const [events, setEvents] = useState<EventDisplay[]>([]);
    const [loading, setLoading] = useState(false);
    const [sort, setSort] = useState<string>("top");
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>([]);
    const [hideVirtual, setHideVirtual] = useState<boolean>(false);

    useEffect(() => {
        let canceled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await getOpenEventsForListAction();
                if (!canceled) setEvents((data || []).filter((e: any) => e?.startAt));
            } catch (e) {
                if (!canceled) setEvents([]);
            } finally {
                if (!canceled) setLoading(false);
            }
        };
        load();
        return () => {
            canceled = true;
        };
    }, []);

    const userLngLat: [number, number] | undefined = (() => {
        const loc: any = (user as any)?.location;
        const ll = loc?.lngLat;
        if (Array.isArray(ll) && ll.length === 2 && typeof ll[0] === "number" && typeof ll[1] === "number") {
            return [ll[0], ll[1]];
        }
        const coords = loc?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) {
            return [coords[0], coords[1]] as [number, number];
        }
        return undefined;
    })();

    const filteredSorted = useMemo(() => {
        let list = [...events];

        // Optional SDG filter: if any SDGs selected, filter to matching
        if (selectedSdgs.length > 0) {
            const chosen = new Set(selectedSdgs.map((s) => s.handle));
            list = list.filter((e) => (e.causes || []).some((c) => chosen.has(c)));
        }
        // Optionally hide virtual-only events
        if (hideVirtual) {
            list = list.filter((e) => !e.isVirtual);
        }

        const byAttendees = (a: EventDisplay, b: EventDisplay) => (b.attendees ?? 0) - (a.attendees ?? 0);
        const byCreatedDesc = (a: EventDisplay, b: EventDisplay) =>
            new Date(b.createdAt || b.startAt || 0).getTime() - new Date(a.createdAt || a.startAt || 0).getTime();
        const byStartAsc = (a: EventDisplay, b: EventDisplay) =>
            new Date(a.startAt || 0).getTime() - new Date(b.startAt || 0).getTime();

        if (sort === "near") {
            if (userLngLat) {
                list.sort((a, b) => {
                    const la: any = (a as any).location;
                    const lb: any = (b as any).location;
                    const da = haversineKm(la?.lngLat, userLngLat);
                    const db = haversineKm(lb?.lngLat, userLngLat);
                    return da - db;
                });
            } else {
                list.sort(byAttendees); // fallback
            }
        } else if (sort === "new") {
            list.sort(byCreatedDesc);
        } else if (sort === "similarity") {
            if (selectedSdgs.length > 0) {
                const chosen = new Set(selectedSdgs.map((s) => s.handle));
                const score = (e: EventDisplay) =>
                    (e.causes || []).reduce((acc, c) => acc + (chosen.has(c) ? 1 : 0), 0);
                list.sort((a, b) => score(b) - score(a) || byAttendees(a, b));
            } else {
                list.sort(byAttendees);
            }
        } else {
            // top
            list.sort(byAttendees);
        }

        // Tie-break by soonest start
        list = list.sort((a, b) => {
            const s = byStartAsc(a, b);
            return s === 0 ? 0 : s;
        });

        return list;
    }, [events, userLngLat, sort, selectedSdgs]);

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
                <div className="text-base font-semibold">Events</div>
                <div className="text-xs text-muted-foreground">
                    {loading ? "Loading…" : `${filteredSorted.length} upcoming`}
                </div>
            </div>
            <div className="px-2">
                <div className="flex items-center justify-between gap-3">
                    <ListFilter
                        defaultValue="top"
                        onFilterChange={setSort}
                        selectedSdgs={selectedSdgs}
                        onSdgChange={setSelectedSdgs}
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                        <input
                            type="checkbox"
                            checked={hideVirtual}
                            onChange={(e) => setHideVirtual(e.target.checked)}
                            className="h-4 w-4"
                        />
                        Hide virtual
                    </label>
                </div>
            </div>
            <div className="scrollbar-hover stable-scrollbar flex-1 overflow-y-auto p-2 pt-0">
                {filteredSorted.length === 0 && !loading && (
                    <div className="p-6 text-center text-sm text-muted-foreground">No upcoming events found.</div>
                )}
                <div className="flex flex-col gap-2">
                    {filteredSorted.map((e) => (
                        <EventRow key={(e as any)._id} e={e} />
                    ))}
                </div>
            </div>
            <div className="border-t p-2 text-right">
                <Link href="/explore?category=events" className="inline-block">
                    <Button variant="ghost" size="sm">
                        View on map
                    </Button>
                </Link>
            </div>
        </div>
    );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ListFilter } from "@/components/utils/list-filter";
import { getOpenEventsForMapAction } from "@/components/modules/circles/map-explorer-actions";
import type { EventDisplay, Cause as SDG } from "@/models/models";
import { CalendarIcon, Clock, MapPin, Users } from "lucide-react";
import { format } from "date-fns";

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

const MobileEventRow: React.FC<{ e: EventDisplay }> = ({ e }) => {
    const attendees = e.attendees ?? 0;
    const locationString = (() => {
        if (e.isVirtual) return "Online";
        const loc: any = e.location || {};
        const parts = [loc.street, loc.city, loc.region, loc.country].filter(Boolean) as string[];
        return parts.length ? parts.join(", ") : undefined;
    })();
    const href = e?.circle?.handle && (e as any)._id ? `/circles/${e.circle!.handle}/events/${(e as any)._id}` : "#";

    return (
        <Link href={href} className="flex items-center gap-3 rounded px-3 py-2 active:bg-gray-100">
            {e.images?.[0]?.fileInfo?.url && (
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded border">
                    <Image
                        src={e.images[0].fileInfo.url}
                        alt={e.title || "Event"}
                        fill
                        sizes="48px"
                        className="object-cover"
                    />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{e.title || "Untitled"}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="inline-flex items-center">
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        {fmtRange(e.startAt, e.endAt, e.allDay)}
                    </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
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
            {e.stage === "review" && (
                <span className="ml-auto inline-flex items-center rounded border border-yellow-400 bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-800">
                    <Clock className="mr-1 h-3 w-3" />
                    Review
                </span>
            )}
            {e.stage === "cancelled" && (
                <span className="ml-auto inline-flex items-center rounded border border-red-400 bg-red-100 px-1.5 py-0.5 text-[10px] text-red-800">
                    Cancelled
                </span>
            )}
        </Link>
    );
};

export default function MobileEventsPanel() {
    const [user] = useAtom(userAtom);
    const [events, setEvents] = useState<EventDisplay[]>([]);
    const [loading, setLoading] = useState(false);
    const [sort, setSort] = useState<string>("top");
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>([]);

    useEffect(() => {
        let canceled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await getOpenEventsForMapAction();
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

        if (selectedSdgs.length > 0) {
            const chosen = new Set(selectedSdgs.map((s) => s.handle));
            list = list.filter((e) => (e.causes || []).some((c) => chosen.has(c)));
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
                list.sort(byAttendees);
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
        list = list.sort((a, b) => byStartAsc(a, b));

        return list;
    }, [events, userLngLat, sort, selectedSdgs]);

    return (
        <div className="flex h-full flex-col">
            <div className="px-3 py-2">
                <ListFilter
                    defaultValue="top"
                    onFilterChange={setSort}
                    selectedSdgs={selectedSdgs}
                    onSdgChange={setSelectedSdgs}
                />
            </div>
            {loading && <div className="px-3 pb-2 text-sm text-muted-foreground">Loading…</div>}
            {!loading && filteredSorted.length === 0 && (
                <div className="px-3 pb-2 text-sm text-muted-foreground">No upcoming events found.</div>
            )}
            <div className="flex-1 overflow-y-auto pb-2">
                <div className="flex flex-col gap-1">
                    {filteredSorted.map((e) => (
                        <MobileEventRow key={(e as any)._id} e={e} />
                    ))}
                </div>
            </div>
        </div>
    );
}

"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CalendarView from "./calendar";
import EventTimeline from "./event-timeline";
import { EventDisplay, Circle } from "@/models/models";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

type Props = {
    circle: Circle;
    events: EventDisplay[];
    canCreate: boolean;
};

export default function EventsTabs({ circle, events, canCreate }: Props) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const initialTab = useMemo(() => {
        const v = (searchParams.get("view") || "").toLowerCase();
        return v === "calendar" ? "calendar" : "timeline";
    }, [searchParams]);

    const [tab, setTab] = useState<"calendar" | "timeline">(initialTab as "calendar" | "timeline");
    const [user] = useAtom(userAtom);
    const [includeCreated, setIncludeCreated] = useState(true);
    const [includeParticipating, setIncludeParticipating] = useState(true);
    const [filteredEvents, setFilteredEvents] = useState(events);

    useEffect(() => {
        const fetchEvents = async () => {
            if (circle.circleType === "user" && user?.did === circle.did) {
                const data = await getEventsAction(circle.handle!, undefined, includeCreated, includeParticipating);
                setFilteredEvents(data.events);
            }
        };

        fetchEvents();
    }, [includeCreated, includeParticipating, circle, user]);

    const onTabChange = (value: string) => {
        const newTab = (value === "timeline" ? "timeline" : "calendar") as "calendar" | "timeline";
        setTab(newTab);
        // Keep URL in sync (optional)
        const sp = new URLSearchParams(searchParams.toString());
        if (newTab === "timeline") {
            sp.delete("view");
        } else {
            sp.set("view", "calendar");
        }
        router.replace(`${pathname}?${sp.toString()}`);
    };

    return (
        <div className="flex w-full flex-col items-center">
            <div className="w-full max-w-[1100px]">
                <Tabs value={tab} onValueChange={onTabChange} className="w-full">
                    <div className="mb-4 flex items-center justify-between">
                        <div className="text-2xl font-semibold">Events</div>
                        <div className="flex items-center gap-2">
                            <TabsList className="mr-2 bg-transparent p-0">
                                <TabsTrigger
                                    value="timeline"
                                    className="mr-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                                >
                                    Timeline
                                </TabsTrigger>
                                <TabsTrigger
                                    value="calendar"
                                    className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                                >
                                    Calendar
                                </TabsTrigger>
                            </TabsList>

                            {canCreate && (
                                <Link
                                    href={`/circles/${circle.handle}/events/create`}
                                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                >
                                    Create Event
                                </Link>
                            )}
                        </div>
                    </div>
                    {circle.circleType === "user" && user?.did === circle.did && (
                        <div className="flex items-center gap-4 py-2">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="includeCreated"
                                    checked={includeCreated}
                                    onCheckedChange={(checked) => setIncludeCreated(Boolean(checked))}
                                />
                                <Label htmlFor="includeCreated">Show created</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="includeParticipating"
                                    checked={includeParticipating}
                                    onCheckedChange={(checked) => setIncludeParticipating(Boolean(checked))}
                                />
                                <Label htmlFor="includeParticipating">Show participating</Label>
                            </div>
                        </div>
                    )}

                    <TabsContent value="timeline" className="mt-0">
                        <EventTimeline circleHandle={circle.handle!} events={filteredEvents} />
                    </TabsContent>
                </Tabs>
            </div>
            <Tabs value={tab} onValueChange={onTabChange} className="w-full">
                <TabsContent value="calendar" className="mt-0">
                    <CalendarView circleHandle={circle.handle!} events={filteredEvents} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

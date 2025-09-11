"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CalendarView from "./calendar";
import EventTimeline from "./event-timeline";
import { EventDisplay } from "@/models/models";

type Props = {
    circleHandle: string;
    events: EventDisplay[];
    canCreate: boolean;
};

export default function EventsTabs({ circleHandle, events, canCreate }: Props) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const initialTab = useMemo(() => {
        const v = (searchParams.get("view") || "").toLowerCase();
        return v === "calendar" ? "calendar" : "timeline";
    }, [searchParams]);

    const [tab, setTab] = useState<"calendar" | "timeline">(initialTab as "calendar" | "timeline");

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
                                    href={`/circles/${circleHandle}/events/create`}
                                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                >
                                    Create Event
                                </Link>
                            )}
                        </div>
                    </div>

                    <TabsContent value="timeline" className="mt-0">
                        <EventTimeline circleHandle={circleHandle} events={events} />
                    </TabsContent>
                </Tabs>
            </div>
            <Tabs value={tab} onValueChange={onTabChange} className="w-full">
                <TabsContent value="calendar" className="mt-0">
                    <CalendarView circleHandle={circleHandle} events={events} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

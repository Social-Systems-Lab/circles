"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CalendarView from "./calendar";
import EventTimeline from "./event-timeline";
import { EventDisplay, Circle } from "@/models/models";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
import { getIssuesAction } from "@/app/circles/[handle]/issues/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

type Props = {
    circle: Circle;
    events: EventDisplay[];
    canCreate: boolean;
};

type Milestone = { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string };

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
    const [milestones, setMilestones] = useState<Milestone[]>([]);

    const handleEventHidden = useCallback(
        (eventId: string) => {
            if (!eventId) return;
            setFilteredEvents((prev) =>
                prev.filter((evt) => {
                    const id = ((evt as any)._id?.toString?.() || (evt as any)._id || "") as string;
                    return id !== eventId;
                }),
            );
        },
        [setFilteredEvents],
    );

    useEffect(() => {
        const fetchEvents = async () => {
            if (circle.circleType === "user" && user?.did === circle.did) {
                const data = await getEventsAction(circle.handle!, undefined, includeCreated, includeParticipating);
                setFilteredEvents(data.events);
            }
        };

        fetchEvents();
    }, [includeCreated, includeParticipating, circle, user]);

    useEffect(() => {
        const fetchMilestones = async () => {
            try {
                const isSelfUserCircle = circle.circleType === "user" && user?.did === circle.did;
                const includeCreatedFinal = isSelfUserCircle ? includeCreated : undefined;
                const includeParticipatingFinal = isSelfUserCircle ? includeParticipating : undefined;

                const [goalsRes, tasksRes, issuesRes] = await Promise.all([
                    getGoalsAction(circle.handle!, includeCreatedFinal, includeParticipatingFinal),
                    getTasksAction(circle.handle!, includeCreatedFinal, includeParticipatingFinal),
                    getIssuesAction(circle.handle!, includeCreatedFinal, includeParticipatingFinal),
                ]);

                const goalMilestones: Milestone[] = (goalsRes?.goals || [])
                    .filter((g: any) => g?.targetDate)
                    .map((g: any) => ({
                        id: (g as any)._id?.toString?.() || g._id,
                        type: "goal",
                        title: g.title,
                        date: g.targetDate,
                    }));

                const taskMilestones: Milestone[] = (tasksRes?.tasks || [])
                    .filter((t: any) => t?.targetDate)
                    .map((t: any) => ({
                        id: (t as any)._id?.toString?.() || t._id,
                        type: "task",
                        title: t.title,
                        date: t.targetDate,
                    }));

                const issueMilestones: Milestone[] = (issuesRes || [])
                    .filter((i: any) => i?.targetDate)
                    .map((i: any) => ({
                        id: (i as any)._id?.toString?.() || i._id,
                        type: "issue",
                        title: i.title,
                        date: i.targetDate,
                    }));

                setMilestones([...goalMilestones, ...taskMilestones, ...issueMilestones]);
            } catch (e) {
                setMilestones([]);
            }
        };

        fetchMilestones();
    }, [circle, user, includeCreated, includeParticipating]);

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
                        <EventTimeline
                            circleHandle={circle.handle!}
                            events={filteredEvents}
                            milestones={milestones}
                            onEventHidden={handleEventHidden}
                        />
                    </TabsContent>
                </Tabs>
            </div>
            <Tabs value={tab} onValueChange={onTabChange} className="w-full">
                <TabsContent value="calendar" className="mt-0">
                    <CalendarView circleHandle={circle.handle!} events={filteredEvents} milestones={milestones} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTasksByEventAction } from "@/app/circles/[handle]/events/actions";
import { TaskDisplay } from "@/models/models";

type Props = {
    circleHandle: string;
    eventId: string;
};

const getStageInfo = (stage?: TaskDisplay["stage"]) => {
    switch (stage) {
        case "review":
            return { className: "bg-yellow-200 text-yellow-800", text: "Review" };
        case "open":
            return { className: "bg-blue-200 text-blue-800", text: "Open" };
        case "inProgress":
            return { className: "bg-orange-200 text-orange-800", text: "In Progress" };
        case "resolved":
            return { className: "bg-green-200 text-green-800", text: "Resolved" };
        default:
            return { className: "bg-gray-200 text-gray-800", text: stage || "Unknown" };
    }
};

export default function EventTasksPanel({ circleHandle, eventId }: Props) {
    const [tasks, setTasks] = useState<TaskDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const res = await getTasksByEventAction(circleHandle, eventId);
                if (mounted) setTasks(res.tasks || []);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [circleHandle, eventId]);

    return (
        <div className="rounded-lg border bg-white/70 p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">Tasks linked to this event</div>
                <Button
                    size="sm"
                    onClick={() => router.push(`/circles/${circleHandle}/tasks/create?eventId=${eventId}`)}
                >
                    Create Task
                </Button>
            </div>

            {loading ? (
                <div className="text-sm text-muted-foreground">Loading tasks...</div>
            ) : tasks.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tasks linked yet.</div>
            ) : (
                <div className="space-y-2">
                    {tasks.map((t) => {
                        const stageInfo = getStageInfo(t.stage);
                        return (
                            <div
                                key={t._id}
                                className="flex items-center justify-between rounded-md border bg-white px-3 py-2 hover:bg-muted/50"
                            >
                                <Link
                                    href={`/circles/${circleHandle}/tasks/${t._id}`}
                                    className="font-medium text-blue-600 hover:underline"
                                >
                                    {t.title}
                                </Link>
                                <Badge className={stageInfo.className}>{stageInfo.text}</Badge>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

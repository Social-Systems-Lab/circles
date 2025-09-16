"use client";

import { useEffect, useState } from "react";
import { listDiscussionsAction } from "@/app/circles/[handle]/discussions/actions";
import { Post } from "@/models/models";

interface DiscussionListProps {
    circleHandle: string;
}

export default function DiscussionList({ circleHandle }: DiscussionListProps) {
    const [discussions, setDiscussions] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDiscussions() {
            try {
                const result = await listDiscussionsAction(circleHandle);
                setDiscussions(result || []);
            } catch (err) {
                console.error("Failed to load discussions", err);
            } finally {
                setLoading(false);
            }
        }
        fetchDiscussions();
    }, [circleHandle]);

    if (loading) return <div>Loading discussions...</div>;

    if (!discussions.length) return <div>No discussions yet.</div>;

    return (
        <div className="space-y-4">
            {discussions.map((d) => (
                <div key={d._id?.toString()} className="rounded border bg-white p-4 shadow">
                    <h3 className="font-semibold">{d.title || "Untitled Discussion"}</h3>
                    <p className="text-sm text-gray-600">{d.content}</p>
                    {d.pinned && <span className="text-xs text-blue-500">📌 Pinned</span>}
                    {d.closed && <span className="ml-2 text-xs text-red-500">Closed</span>}
                </div>
            ))}
        </div>
    );
}

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
            <div className="flex justify-end">
                <a
                    href="./discussions/new"
                    className="rounded bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
                >
                    + New Discussion
                </a>
            </div>
            {discussions.map((d) => (
                <div key={d._id?.toString()} className="rounded border bg-white p-4 shadow hover:bg-gray-50">
                    <h3 className="text-lg font-semibold text-blue-700">{d.title || "Untitled Discussion"}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{d.content}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <div>
                            {d.pinned && <span className="mr-2 text-blue-500">📌 Pinned</span>}
                            {d.closed && <span className="text-red-500">Closed</span>}
                        </div>
                        <div>
                            <span>{d.comments || 0} replies</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

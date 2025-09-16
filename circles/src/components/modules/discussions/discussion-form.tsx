"use client";

import { useState } from "react";
import { createDiscussionAction } from "@/app/circles/[handle]/discussions/actions";

interface DiscussionFormProps {
    circleHandle: string;
    onCreated?: () => void;
}

export default function DiscussionForm({ circleHandle, onCreated }: DiscussionFormProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await createDiscussionAction(circleHandle, { title, content });
            setTitle("");
            setContent("");
            if (onCreated) onCreated();
        } catch (err: any) {
            console.error("Failed to create discussion", err);
            setError(err.message || "Failed to create discussion");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded border bg-white p-4 shadow">
            <h3 className="font-semibold">Start a Discussion</h3>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded border p-2"
                required
            />
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full rounded border p-2"
                required
            />
            <button
                type="submit"
                disabled={loading}
                className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            >
                {loading ? "Posting..." : "Post Discussion"}
            </button>
        </form>
    );
}

"use client";

import { pinDiscussionAction, closeDiscussionAction } from "@/app/circles/[handle]/discussions/actions";
import { useState } from "react";

interface DiscussionAdminControlsProps {
    discussionId: string;
    pinned: boolean;
    closed: boolean;
    onUpdated?: () => void;
}

export default function DiscussionAdminControls({
    discussionId,
    pinned,
    closed,
    onUpdated,
}: DiscussionAdminControlsProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handlePinToggle() {
        setLoading(true);
        setError(null);
        try {
            await pinDiscussionAction(discussionId, !pinned);
            if (onUpdated) onUpdated();
        } catch (err: any) {
            console.error("Failed to pin/unpin discussion", err);
            setError(err.message || "Failed to pin/unpin discussion");
        } finally {
            setLoading(false);
        }
    }

    async function handleClose() {
        setLoading(true);
        setError(null);
        try {
            await closeDiscussionAction(discussionId);
            if (onUpdated) onUpdated();
        } catch (err: any) {
            console.error("Failed to close discussion", err);
            setError(err.message || "Failed to close discussion");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mt-2 flex space-x-2">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
                onClick={handlePinToggle}
                disabled={loading}
                className="rounded bg-yellow-500 px-3 py-1 text-white hover:bg-yellow-600 disabled:opacity-50"
            >
                {pinned ? "Unpin" : "Pin"}
            </button>
            {!closed && (
                <button
                    onClick={handleClose}
                    disabled={loading}
                    className="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600 disabled:opacity-50"
                >
                    Close
                </button>
            )}
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { getDiscussionAction, addCommentAction } from "@/app/circles/[handle]/discussions/actions";
import { Post, Comment } from "@/models/models";

interface DiscussionDetailProps {
    discussionId: string;
}

export default function DiscussionDetail({ discussionId }: DiscussionDetailProps) {
    const [discussion, setDiscussion] = useState<Post | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState("");

    useEffect(() => {
        async function fetchDiscussion() {
            try {
                const result = await getDiscussionAction(discussionId);
                if (result) {
                    setDiscussion(result as Post);
                    // @ts-ignore: comments may be populated
                    setComments(result.comments || []);
                }
            } catch (err) {
                console.error("Failed to load discussion", err);
            } finally {
                setLoading(false);
            }
        }
        fetchDiscussion();
    }, [discussionId]);

    async function handleAddComment() {
        if (!newComment.trim()) return;
        try {
            await addCommentAction(discussionId, { content: newComment });
            const refreshed = await getDiscussionAction(discussionId);
            if (refreshed && (refreshed as any).comments) {
                // @ts-ignore
                setComments((refreshed as any).comments);
            }
            setNewComment("");
        } catch (err) {
            console.error("Failed to add comment", err);
        }
    }

    if (loading) return <div>Loading discussion...</div>;
    if (!discussion) return <div>Discussion not found.</div>;

    return (
        <div className="space-y-4">
            <div className="rounded border bg-white p-4 shadow">
                <h2 className="text-lg font-semibold">{discussion.title || "Untitled Discussion"}</h2>
                <p className="text-sm text-gray-600">{discussion.content}</p>
                {discussion.pinned && <span className="text-xs text-blue-500">📌 Pinned</span>}
                {discussion.closed && <span className="ml-2 text-xs text-red-500">Closed</span>}
            </div>

            <div className="space-y-2">
                <h3 className="font-semibold">Comments</h3>
                {comments.length === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
                {comments.map((c) => (
                    <div key={c._id?.toString()} className="rounded border bg-gray-50 p-2">
                        <p className="text-sm">{c.content}</p>
                    </div>
                ))}
            </div>

            {!discussion.closed && (
                <div className="mt-4">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="w-full rounded border p-2"
                        placeholder="Write a comment..."
                    />
                    <button
                        onClick={handleAddComment}
                        className="mt-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                    >
                        Add Comment
                    </button>
                </div>
            )}
        </div>
    );
}

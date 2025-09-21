"use client";

import { useState } from "react";
import { Comment } from "@/models/models";

interface DiscussionCommentItemProps {
    comment: Comment;
    replies?: Comment[];
    depth?: number;
}

export default function DiscussionCommentItem({ comment, replies = [], depth = 0 }: DiscussionCommentItemProps) {
    const [showReplies, setShowReplies] = useState(false);

    return (
        <div className="space-y-2 rounded border bg-gray-50 p-3">
            <p className="text-sm">{comment.content}</p>

            {/* Author + actions at bottom */}
            <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{comment.createdBy || "Unknown"}</span>
                <div className="flex space-x-3">
                    <button className="hover:underline">Like</button>
                    <button className="hover:underline">Reply</button>
                </div>
            </div>

            {/* Replies */}
            {replies.length > 0 && depth < 2 && (
                <div className="ml-4 mt-2">
                    {!showReplies ? (
                        <button onClick={() => setShowReplies(true)} className="text-xs text-blue-500 hover:underline">
                            View {replies.length} repl{replies.length > 1 ? "ies" : "y"}
                        </button>
                    ) : (
                        <div className="space-y-2">
                            {replies.map((r) => (
                                <DiscussionCommentItem
                                    key={r._id?.toString()}
                                    comment={r}
                                    replies={Array.isArray(r.replies) ? r.replies : []}
                                    depth={depth + 1}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

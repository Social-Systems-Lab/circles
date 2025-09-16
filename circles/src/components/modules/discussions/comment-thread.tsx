"use client";

import { Comment } from "@/models/models";

interface CommentThreadProps {
    comments: Comment[];
}

export default function CommentThread({ comments }: CommentThreadProps) {
    if (!comments || comments.length === 0) {
        return <p className="text-sm text-gray-500">No comments yet.</p>;
    }

    return (
        <div className="space-y-2">
            {comments.map((c) => (
                <div key={c._id?.toString()} className="rounded border bg-gray-50 p-2">
                    <p className="text-sm">{c.content}</p>
                </div>
            ))}
        </div>
    );
}

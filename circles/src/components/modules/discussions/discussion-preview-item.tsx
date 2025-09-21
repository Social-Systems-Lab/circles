"use client";

import Link from "next/link";
// Use PostDisplay instead of Post to include author and populated fields
import type { PostDisplay } from "@/models/models";
import { formatDistanceToNow } from "date-fns";

interface DiscussionPreviewItemProps {
    // Use PostDisplay type here
    discussion: PostDisplay;
    circleHandle: string;
}

export default function DiscussionPreviewItem({ discussion, circleHandle }: DiscussionPreviewItemProps) {
    return (
        <Link
            // Use _id instead of id
            href={`/circles/${circleHandle}/discussions/${discussion._id}`}
            className="block border-b border-gray-200 py-4 hover:bg-gray-50"
        >
            <div className="flex flex-col">
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{discussion.author?.name}</span>
                    <span>
                        {formatDistanceToNow(new Date(discussion.createdAt), {
                            addSuffix: true,
                        })}
                    </span>
                </div>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">{discussion.title}</h3>
                <p className="mt-2 line-clamp-2 text-gray-700">{discussion.content}</p>
            </div>
        </Link>
    );
}

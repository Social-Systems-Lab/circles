"use client";

import { Post } from "@/models/models";
import DiscussionPost from "./discussion-post";

interface DiscussionListProps {
    discussions: Post[];
}

export default function DiscussionList({ discussions }: DiscussionListProps) {
    if (!discussions || discussions.length === 0) {
        return <div>No discussions yet.</div>;
    }

    return (
        <div className="space-y-4">
            {discussions.map((d) => (
                <DiscussionPost key={d._id?.toString()} discussion={d as any} />
            ))}
        </div>
    );
}

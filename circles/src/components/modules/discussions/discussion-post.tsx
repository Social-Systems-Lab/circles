"use client";

import { Post } from "@/models/models";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { likeContentAction, unlikeContentAction } from "@/components/modules/feeds/actions";
import { Button } from "@/components/ui/button";
import { ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";

import { MentionDisplay } from "@/models/models";
import RichText from "../feeds/RichText";

interface DiscussionPostProps {
    discussion: Post & { author?: any; mentionsDisplay?: MentionDisplay[] };
}

export default function DiscussionPost({ discussion }: DiscussionPostProps) {
    const [liked, setLiked] = useState(false);
    const [likes, setLikes] = useState(discussion.reactions?.like || 0);

    async function toggleLike() {
        if (liked) {
            const result = await unlikeContentAction(discussion._id as string, "post");
            if (result.success) {
                setLiked(false);
                setLikes((l) => l - 1);
            }
        } else {
            const result = await likeContentAction(discussion._id as string, "post");
            if (result.success) {
                setLiked(true);
                setLikes((l) => l + 1);
            }
        }
    }

    return (
        <div className="formatted rounded border bg-white p-4 shadow">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">{discussion.title}</h2>
                    <p className="text-sm text-gray-500">
                        <span className="flex items-center gap-2">
                            {discussion.author?.picture?.url && (
                                <img
                                    src={discussion.author.picture.url}
                                    alt={discussion.author?.name}
                                    className="h-5 w-5 rounded-full object-cover"
                                />
                            )}
                            {discussion.author?.name || discussion.createdBy} ·{" "}
                            {formatDistanceToNow(new Date(discussion.createdAt), { addSuffix: true })}
                        </span>
                    </p>
                </div>
            </div>
            <div className="mt-2 line-clamp-1 text-sm text-gray-700">
                <RichText content={discussion.content} mentions={discussion.mentionsDisplay} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleLike}
                    className={liked ? "text-blue-600" : ""}
                >
                    <ThumbsUp className="mr-1 h-4 w-4" />
                    {likes}
                </Button>
            </div>
        </div>
    );
}

"use client";

import { PostDisplay } from "@/models/models";
import { getPublishTime } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import { AiOutlineHeart } from "react-icons/ai";
import RichText from "../feeds/RichText";

export const DiscussionPreviewItem = ({ discussion }: { discussion: PostDisplay }) => {
    const formattedDate = getPublishTime(discussion?.createdAt);

    return (
        <div
            className={`formatted relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-[15px] border-0 bg-white p-4 shadow-lg`}
        >
            <div>
                {discussion.title && <div className="text-xl font-semibold">{discussion.title}</div>}
                <div className="text-sm text-gray-500">{formattedDate}</div>
            </div>
            <div className="line-clamp-2">
                <RichText content={discussion.content} mentions={discussion.mentionsDisplay} />
            </div>
            <div className="flex items-center justify-between text-gray-500">
                <div className="flex items-center gap-1.5">
                    <AiOutlineHeart className="h-5 w-5" />
                    {discussion.reactions?.like || 0}
                </div>
                <div className="flex items-center gap-1.5">
                    <MessageCircle className="h-5 w-5" />
                    {discussion.comments || 0}
                </div>
            </div>
        </div>
    );
};

export default DiscussionPreviewItem;

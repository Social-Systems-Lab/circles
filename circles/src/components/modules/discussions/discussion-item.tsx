// discussion-item.tsx - copy of PostItem adapted for discussions
"use client";

import {
    Circle,
    Feed,
    PostDisplay,
    CommentDisplay,
    ContentPreviewData,
    MentionDisplay,
    Cause as SDG,
} from "@/models/models";
import { sdgs } from "@/lib/data/sdgs";
import { UserPicture } from "../members/user-picture";
import { CirclePicture } from "../circles/circle-picture";
import { Button } from "@/components/ui/button";
import { Edit, Heart, Loader2, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import React, {
    Dispatch,
    KeyboardEvent,
    memo,
    SetStateAction,
    useCallback,
    useEffect,
    useMemo,
    useState,
    useTransition,
} from "react";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { getPublishTime } from "@/lib/utils";
import {
    contentPreviewAtom,
    focusPostAtom,
    imageGalleryAtom,
    sidePanelContentVisibleAtom,
    userAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import TextareaAutosize from "react-textarea-autosize";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    addCommentAction,
    getDiscussionAction,
    createDiscussionAction,
    listDiscussionsAction,
    pinDiscussionAction,
    closeDiscussionAction,
} from "@/app/circles/[handle]/discussions/actions";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
import { useToast } from "@/components/ui/use-toast";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import { MentionsInput, Mention, SuggestionDataItem } from "react-mentions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import RichText from "../feeds/RichText";
import UserBadge from "../users/user-badge";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import InternalLinkPreview from "../feeds/InternalLinkPreview";

export const DiscussionItem = ({
    discussion,
    circle,
    feed,
    initialComments,
    initialShowAllComments,
    embedded,
    disableComments,
}: {
    discussion: PostDisplay;
    circle: Circle;
    feed: Feed;
    initialComments?: CommentDisplay[];
    initialShowAllComments?: boolean;
    embedded?: boolean;
    disableComments?: boolean;
}) => {
    const formattedDate = getPublishTime(discussion?.createdAt);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
    const [comments, setComments] = useState<CommentDisplay[]>(initialComments ?? []);
    const [showAllComments, setShowAllComments] = useState(initialShowAllComments ?? false);
    const [newCommentContent, setNewCommentContent] = useState("");
    const [user] = useAtom(userAtom);
    const isAuthor = user && discussion.createdBy === user?.did;
    const canModerate = circle && isAuthorized(user, circle, features.feed.moderate);
    const canComment = circle && isAuthorized(user, circle, features.feed.comment);
    const { toast } = useToast();

    const handleLikeDiscussion = () => {
        // similar to PostItem like handler
    };

    const handleAddComment = () => {
        // similar to PostItem comment handler
    };

    return (
        <div
            className={`formatted relative flex min-w-0 flex-col gap-4 overflow-hidden ${
                isCompact || embedded ? "" : "rounded-[15px] border-0 shadow-lg"
            } bg-white`}
        >
            <div className="pl-4 pr-4 pt-4">
                {discussion.title && <div className="text-xl font-semibold">{discussion.title}</div>}
                <div className="text-sm text-gray-500">{formattedDate}</div>
            </div>
            {!embedded && (
                <div className="pl-4 pr-4">
                    <RichText content={discussion.content} mentions={discussion.mentionsDisplay} />
                </div>
            )}
            {discussion.media && discussion.media.length > 0 && (
                <div className="relative h-64 w-full rounded-lg pl-4 pr-4">
                    <Carousel>
                        <CarouselContent>
                            {discussion.media.map((mediaItem: any, index: number) => {
                                if (!mediaItem?.fileInfo?.url) return null;
                                return (
                                    <CarouselItem key={index}>
                                        <img
                                            src={mediaItem.fileInfo.url}
                                            alt={mediaItem.name || "media"}
                                            className="h-64 w-full rounded-lg object-cover"
                                        />
                                    </CarouselItem>
                                );
                            })}
                        </CarouselContent>
                    </Carousel>
                </div>
            )}
            <div className="flex items-center justify-between pl-4 pr-4 text-gray-500">
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

export default DiscussionItem;

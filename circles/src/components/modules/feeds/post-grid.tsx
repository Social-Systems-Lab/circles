// post-grid.tsx - component for displaying posts in a grid layout
"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Circle, Feed, PostDisplay } from "@/models/models";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useAtom } from "jotai";
import { contentPreviewAtom, sidePanelContentVisibleAtom, userAtom } from "@/lib/data/atoms";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { getPublishTime } from "@/lib/utils";
import { Heart, MapPin, MessageCircle, X } from "lucide-react";
import { UserPicture } from "../members/user-picture";
import emptyFeed from "@images/empty-feed.png";
import { PostItem } from "./post-list";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface PostGridProps {
    posts: PostDisplay[];
    circle?: Circle;
    feed?: Feed;
    isLoading?: boolean;
}

export function PostGrid({ posts, circle, feed, isLoading }: PostGridProps) {
    const [user] = useAtom(userAtom);
    const router = useRouter();
    const isMobile = useIsMobile();
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [expandedPost, setExpandedPost] = React.useState<PostDisplay | null>(null);

    const getDistanceString = (distance: number) => {
        if (distance < 1) {
            return `${Math.round(distance * 1000)} m`;
        }
        if (distance < 10) {
            return `${distance.toFixed(1)} km`;
        }
        if (distance < 100) {
            return `${(distance / 10).toFixed(1)} mil`;
        }
        return `${(distance / 10).toFixed(0)} mil`;
    };

    const getAddressString = (location?: any) => {
        if (!location) return "";
        const parts = [];
        if (location.street) parts.push(location.street);
        if (location.city) parts.push(location.city);
        return parts.join(", ");
    };

    const containerVariants = {
        hidden: {},
        visible: {
            transition: {
                staggerChildren: 0.05,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: (index: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: index * 0.05,
                type: "spring",
                stiffness: 100,
                damping: 15,
            },
        }),
    };

    const handlePostClick = (post: PostDisplay) => {
        if (isMobile) {
            router.push(`/circles/${circle?.handle || (post as any).circleHandle}/feed#post-${post._id}`);
            return;
        }

        setExpandedPost(post);
    };

    // Extract preview text from post content
    const getPreviewText = (content: string, maxLength: number = 120) => {
        // Remove HTML tags and markdown formatting
        const plainText = content.replace(/<[^>]*>/g, "").replace(/[#*_~`]/g, "");
        return plainText.length > maxLength ? plainText.substring(0, maxLength) + "..." : plainText;
    };

    // Get first image from post
    const getPostImage = (post: PostDisplay) => {
        if (post.media && post.media.length > 0) {
            return post.media[0].fileInfo?.url;
        }
        return null;
    };

    if (isLoading) {
        return (
            <div className="flex h-full min-h-[320px] w-full flex-1 items-center justify-center">
                <div className="text-sm text-gray-500">Loading posts...</div>
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center py-12">
                <Image src={emptyFeed} alt="No posts yet" width={isMobile ? 230 : 300} />
                <h4>No posts yet</h4>
                <div className="max-w-[700px] pl-4 pr-4 text-center">
                    There are no posts on this noticeboard yet. Be the first to share something!
                </div>
            </div>
        );
    }

    return (
        <>
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
                style={{ gridAutoRows: "1fr" }}
            >
                <AnimatePresence mode="popLayout">
                    {posts.map((post, index) => {
                        const postImage = getPostImage(post);
                        const formattedDate = getPublishTime(post.createdAt);
                        const author = post.author as Circle;

                        return (
                            <motion.div
                                key={post._id}
                                variants={itemVariants}
                                custom={index}
                                initial="hidden"
                                animate="visible"
                                exit="hidden"
                                layout
                                className={`flex h-full cursor-pointer flex-col overflow-hidden rounded-[15px] border-0 ${
                                    post._id === expandedPost?._id ? "bg-[#f7f7f7]" : "bg-white"
                                } relative shadow-lg transition-shadow duration-200 hover:shadow-md`}
                                onClick={() => handlePostClick(post)}
                            >
                                {/* Post Image */}
                                <div className="relative h-[200px] w-full overflow-hidden bg-gray-100">
                                    {postImage ? (
                                        <Image
                                            src={postImage}
                                            alt="Post image"
                                            className="object-cover"
                                            fill
                                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                            <MessageCircle className="h-12 w-12 text-gray-400" />
                                        </div>
                                    )}
                                </div>

                                {/* Post Content */}
                                <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
                                    {/* Title (if exists) */}
                                    {post.title && (
                                        <h3 className="mb-2 text-lg font-bold text-gray-900">{post.title}</h3>
                                    )}

                                    {/* Post Preview Text */}
                                    <p className="mb-4 line-clamp-3 flex-1 text-sm text-gray-700">
                                        {getPreviewText(post.content)}
                                    </p>

                                    {/* Author Info and Date at Bottom Right */}
                                    <div className="flex items-center justify-between gap-2">
                                        {post.location && post.metrics?.distance !== undefined ? (
                                            <HoverCard openDelay={200}>
                                                <HoverCardTrigger>
                                                    <div className="flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-100">
                                                        <MapPin className="h-3 w-3 text-gray-500" />
                                                        <span className="max-w-[100px] truncate">
                                                            {getAddressString(post.location)}
                                                        </span>
                                                    </div>
                                                </HoverCardTrigger>
                                                <HoverCardContent className="z-[11000] w-auto p-2 text-xs">
                                                    {getDistanceString(post.metrics.distance)} from your location
                                                </HoverCardContent>
                                            </HoverCard>
                                        ) : post.location ? (
                                            <div className="flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                                <MapPin className="h-3 w-3 text-gray-500" />
                                                <span className="max-w-[100px] truncate">
                                                    {getAddressString(post.location)}
                                                </span>
                                            </div>
                                        ) : (
                                            <div />
                                        )}
                                        <div className="flex items-center gap-2">
                                            <UserPicture
                                                name={author?.name}
                                                picture={author?.picture?.url}
                                                size="24px"
                                                circleType={author?.circleType}
                                            />
                                            <div className="text-right">
                                                <div className="text-xs font-medium text-gray-700">{author?.name}</div>
                                                <div className="text-xs text-gray-500">{formattedDate}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Post Stats below author */}
                                    <div className="mt-3 flex items-center justify-end gap-4 text-xs text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <Heart className="h-3 w-3" />
                                            <span>{post.reactions?.like || 0}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <MessageCircle className="h-3 w-3" />
                                            <span>{post.comments || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* View Post Button */}
                                <div className="border-t p-3">
                                    <Button
                                        variant="ghost"
                                        className="w-full text-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePostClick(post);
                                        }}
                                    >
                                        View Post
                                    </Button>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            <Dialog
                open={!!expandedPost}
                onOpenChange={(open) => {
                    if (!open) setExpandedPost(null);
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-[700px] overflow-y-auto p-0 [&>button]:hidden">
                    {expandedPost && circle && feed && (
                        <PostItem
                            post={expandedPost}
                            circle={circle}
                            feed={feed}
                            isDetailView={true}
                            initialShowAllComments={true}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

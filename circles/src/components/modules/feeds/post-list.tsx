"use client";

import { Circle, Feed, Post, PostDisplay } from "@/models/models";
import { UserPicture } from "../members/user-picture";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle } from "lucide-react"; // Assuming you are using Lucide for icons
import {
    Carousel,
    CarouselApi,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { useEffect, useState } from "react";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { whiteUi } from "@/lib/data/constants";
import Image from "next/image";

type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
};

const PostItem = ({ post, circle }: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = new Date(post.createdAt).toDateString();
    const isCompact = useIsCompact();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Calculate total likes
    const totalLikes = Object.values(post.reactions).reduce((sum, count) => sum + count, 0);
    const totalComments = post.comments?.length || 0;

    useEffect(() => {
        if (!carouselApi) return;

        const updateSelectedSlide = () => {
            setCurrentImageIndex(carouselApi.selectedScrollSnap());
        };

        setCurrentImageIndex(carouselApi.selectedScrollSnap() || 0);
        carouselApi.on("select", updateSelectedSlide);

        return () => {
            carouselApi.off("select", updateSelectedSlide);
        };
    }, [carouselApi]);

    return (
        <div
            className={
                whiteUi
                    ? `flex flex-col gap-4 border-b border-gray-200 bg-white`
                    : `flex flex-col gap-4 ${isCompact ? "" : "rounded-[15px] border-0 shadow-lg"}  bg-white`
            }
        >
            {/* Header with user information */}
            <div className="flex items-center gap-4 pl-4 pr-4 pt-4">
                <UserPicture name={post.author?.name} picture={post.author?.picture?.url} />
                <div className="flex flex-col">
                    <span className="font-semibold">{post.author?.name}</span>
                    <span className="text-sm text-gray-500">{formattedDate}</span>
                </div>
            </div>

            {/* Post content */}
            <div className="pl-4 pr-4 text-lg">{post.content}</div>

            {/* Media carousel (if exists) */}
            {post.media && post.media.length > 0 && (
                <>
                    <div className="relative h-64 w-full rounded-lg pl-4 pr-4">
                        <Carousel setApi={setCarouselApi}>
                            <CarouselContent>
                                {post.media.map((mediaItem, index) => (
                                    <CarouselItem key={index}>
                                        {/* className="basis-[90%]" */}
                                        <img
                                            src={mediaItem.fileInfo.url}
                                            alt={mediaItem.name}
                                            className="h-64 w-full rounded-lg object-cover"
                                        />
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                        </Carousel>
                        {post.media.length > 1 && (
                            <div className="relative flex justify-center">
                                <div className="absolute -bottom-[30px] flex flex-row items-center justify-center">
                                    {post.media.map((_, index) => (
                                        <button
                                            key={index}
                                            onClick={() => carouselApi?.scrollTo(index)}
                                            className={`mx-1 h-2 w-2 rounded-full ${
                                                index === currentImageIndex ? "bg-blue-500" : "bg-gray-300"
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Actions (like and comment) */}
            <div className="flex items-center justify-between pl-4 pr-4 text-gray-500">
                {/* Likes Section */}
                <div className="flex items-center gap-2">
                    <div className="flex cursor-pointer items-center gap-1 text-gray-500">
                        <Heart className="h-5 w-5" />
                        {totalLikes > 0 && <span>{totalLikes}</span>}
                    </div>
                </div>

                {/* Comments Section */}
                <div className="flex items-center gap-2 pl-4 pr-4">
                    <div className="flex cursor-pointer items-center gap-1 text-gray-500">
                        <MessageCircle className="h-5 w-5" />
                        {totalComments > 0 && <span>{totalComments}</span>}
                    </div>
                </div>
            </div>

            {/* Write Comment Section */}
            <div className="flex flex-col gap-2 pb-4 pl-4 pr-4">
                {post.comments?.map((comment, index) => (
                    <div key={index} className="flex items-start gap-2">
                        {/* Smaller profile picture for comments */}
                        <UserPicture name={comment.author.name} picture={comment.author.picture.url} size="small" />
                        <div className="flex w-auto flex-col rounded-lg bg-gray-100 p-2">
                            <div className="text-sm font-semibold">{comment.author.name}</div>
                            <div className="text-sm text-gray-500">{comment.content}</div>
                        </div>
                    </div>
                ))}

                {/* Comment input box */}
                <div className="flex items-center gap-2">
                    {/* No profile icon next to input */}
                    <input
                        type="text"
                        placeholder="Write a comment..."
                        className="flex-grow rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>
        </div>
    );
};

type PostListProps = {
    feed: Feed;
    circle: Circle;
    posts: PostDisplay[];
};

const PostList = ({ feed, circle, posts }: PostListProps) => {
    return (
        <div className={whiteUi ? "" : "flex flex-col gap-6"}>
            {posts.map((post) => (
                <PostItem key={post._id} post={post} circle={circle} feed={feed} />
            ))}
        </div>
    );
};

export default PostList;

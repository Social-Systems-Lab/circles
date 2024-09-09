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
import { useState } from "react";

type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
};

const PostItem = ({ post, circle }: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = new Date(post.createdAt).toDateString();

    return (
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4">
            {/* Header with user information */}
            <div className="flex items-center gap-4">
                <UserPicture name={post.author?.name} picture={post.author?.picture?.url} />
                <div className="flex flex-col">
                    <span className="font-semibold">{post.author?.name}</span>
                    <span className="text-sm text-gray-500">{formattedDate}</span>
                </div>
            </div>

            {/* Post content */}
            <div className="text-lg">{post.content}</div>

            {/* Media carousel (if exists) */}
            {post.media && post.media.length > 0 && (
                <div className="relative h-64 w-full overflow-hidden rounded-lg">
                    <Carousel setApi={setCarouselApi}>
                        <CarouselContent>
                            {post.media.map((mediaItem, index) => (
                                <CarouselItem key={index} className="relative">
                                    <img
                                        src={mediaItem.fileInfo.url} // Use the media file's URL
                                        alt={mediaItem.name}
                                        className="h-64 w-full rounded-lg object-cover"
                                    />
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        <CarouselPrevious />
                        <CarouselNext />
                    </Carousel>
                </div>
            )}

            {/* Actions (like and comment) */}
            <div className="flex items-center justify-between text-gray-500">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" className="flex items-center gap-1 text-gray-500">
                        <Heart className="h-5 w-5" />
                        <span>{Object.values(post.reactions).reduce((sum, count) => sum + count, 0)}</span>
                    </Button>
                    <Button variant="ghost" className="flex items-center gap-1 text-gray-500">
                        <MessageCircle className="h-5 w-5" />
                        <span>Comments</span>
                    </Button>
                </div>
                <span className="text-sm">{post.media?.length ?? 0} comments</span>
            </div>

            {/* Comment Section */}
            <div className="flex flex-col gap-2">
                {/* Example comment (you should render actual comments here) */}
                <div className="flex items-start gap-2">
                    <UserPicture name={post.author.name} picture={post.author.picture.url} size="small" />
                    <div className="flex w-full flex-col rounded-lg bg-gray-100 p-2">
                        <div className="text-sm font-semibold">Patrik Opacic</div>
                        <div className="text-sm text-gray-500">test</div>
                    </div>
                </div>

                {/* Comment input box */}
                <div className="flex items-center gap-2">
                    <UserPicture name={post.author.name} picture={post.author.picture.url} size="small" />
                    <input
                        type="text"
                        placeholder="Write a comment..."
                        className="flex-grow rounded-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <>
            {posts.map((post) => (
                <PostItem key={post._id} post={post} circle={circle} feed={feed} />
            ))}
        </>
    );
};

export default PostList;

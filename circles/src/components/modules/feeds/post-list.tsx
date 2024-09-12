"use client";

import { Circle, Content, Feed, Post, PostDisplay } from "@/models/models";
import { UserPicture } from "../members/user-picture";
import { Button } from "@/components/ui/button";
import { Edit, Heart, MessageCircle, MoreVertical, Trash2 } from "lucide-react"; // Assuming you are using Lucide for icons
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { useEffect, useState } from "react";
import { useIsCompact } from "@/components/utils/use-is-compact";
import Image from "next/image";
import { getPublishTime } from "@/lib/utils";
import { contentPreviewAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
};

const PostItem = ({ post, circle }: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = getPublishTime(post?.createdAt);
    const isCompact = useIsCompact();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [user] = useAtom(userAtom);
    const isAuthor = user && post.author._id === user?._id;

    // State for likes
    const initialLikes = Object.values(post.reactions).reduce((sum, count) => sum + count, 0);
    const [likes, setLikes] = useState<number>(initialLikes);
    const [isLiked, setIsLiked] = useState<boolean>(false);

    // State for comments
    const [comments, setComments] = useState(post.comments || []);
    const [showAllComments, setShowAllComments] = useState(false);
    const [newCommentContent, setNewCommentContent] = useState("");

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

    const handleContentClick = (content: Content) => {
        setContentPreview((x) => (x === content ? undefined : content));
    };

    const handleEditClick = () => {};

    const handleDeleteClick = () => {};

    const handleLikePost = () => {
        if (isLiked) {
            setLikes((prev) => prev - 1);
        } else {
            setLikes((prev) => prev + 1);
        }
        setIsLiked(!isLiked);
        // Simulate backend call here
    };

    const handleAddComment = () => {
        if (!newCommentContent.trim()) return;

        const newComment = {
            _id: "temp-id-" + Date.now(),
            content: newCommentContent,
            author: user,
            likes: 0,
            replies: [],
            createdAt: new Date().toISOString(),
        };
        setComments([...comments, newComment]);
        setNewCommentContent("");
        // Simulate backend call
    };

    // Find the most liked comment
    const mostLikedComment =
        comments.length > 0 ? comments.reduce((prev, current) => (prev.likes > current.likes ? prev : current)) : null;

    return (
        <div className={`flex flex-col gap-4 ${isCompact ? "" : "rounded-[15px] border-0 shadow-lg"}  bg-white`}>
            {/* Header with user information */}
            <div className="flex items-center justify-between pl-4 pr-4 pt-4">
                <div className="flex items-center gap-4">
                    <UserPicture
                        name={post.author?.name}
                        picture={post.author?.picture?.url}
                        onClick={() => handleContentClick(post.author)}
                    />
                    <div className="flex flex-col">
                        <span className="cursor-pointer font-semibold" onClick={() => handleContentClick(post.author)}>
                            {post.author?.name}
                        </span>
                        <span className="text-sm text-gray-500">{formattedDate}</span>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {isAuthor && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleEditClick}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleDeleteClick}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
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
                <div className="flex cursor-pointer items-center gap-1 text-gray-500" onClick={handleLikePost}>
                    <Heart className={`h-5 w-5 ${isLiked ? "fill-current text-red-500" : ""}`} />
                    {likes > 0 && <span>{likes}</span>}
                </div>

                {/* Comments Section */}
                <div className="flex items-center gap-2 pl-4 pr-4">
                    <div className="flex items-center gap-1 text-gray-500">
                        <MessageCircle className="h-5 w-5" />
                        {comments.length > 0 && <span>{comments.length}</span>}
                    </div>
                </div>
            </div>

            {/* Comments Section */}
            <div className="flex flex-col gap-2 pb-4 pl-4 pr-4">
                {/* Show "Show more comments" if more than one comment and not showing all */}
                {!showAllComments && comments.length > 1 && (
                    <div className="cursor-pointer text-xs text-blue-500" onClick={() => setShowAllComments(true)}>
                        Show more comments
                    </div>
                )}

                {/* Display comments */}
                {comments.length > 0 && (
                    <>
                        {showAllComments
                            ? comments.map((comment) => <CommentItem key={comment._id} comment={comment} user={user} />)
                            : mostLikedComment && (
                                  <CommentItem key={mostLikedComment._id} comment={mostLikedComment} user={user} />
                              )}
                    </>
                )}

                {/* Comment input box */}
                <div className="mt-2 flex items-center gap-2">
                    <UserPicture name={user.name} picture={user.picture.url} size="small" />
                    <input
                        type="text"
                        value={newCommentContent}
                        onChange={(e) => setNewCommentContent(e.target.value)}
                        placeholder="Write a comment..."
                        className="flex-grow rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={handleAddComment} className="ml-2 text-blue-500">
                        Post
                    </button>
                </div>
            </div>
        </div>
    );
};

// CommentItem Component
type CommentItemProps = {
    comment: any;
    user: any;
};

const CommentItem = ({ comment, user }: CommentItemProps) => {
    const [showReplies, setShowReplies] = useState(false);
    const [replies, setReplies] = useState(comment.replies || []);
    const [likes, setLikes] = useState(comment.likes || 0);
    const [isLiked, setIsLiked] = useState(false);
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [newReplyContent, setNewReplyContent] = useState("");

    const handleLikeComment = () => {
        if (isLiked) {
            setLikes((prev) => prev - 1);
        } else {
            setLikes((prev) => prev + 1);
        }
        setIsLiked(!isLiked);
        // Simulate backend call
    };

    const handleReplyClick = () => {
        setShowReplyInput(!showReplyInput);
    };

    const handleAddReply = () => {
        if (!newReplyContent.trim()) return;

        const newReply = {
            _id: "temp-id-" + Date.now(),
            content: newReplyContent,
            author: user,
            likes: 0,
            replies: [],
            createdAt: new Date().toISOString(),
        };
        setReplies([...replies, newReply]);
        setNewReplyContent("");
        setShowReplyInput(false);
        // Simulate backend call
    };

    return (
        <div className="ml-4 flex flex-col">
            {/* Comment Content */}
            <div className="flex items-start gap-2">
                <UserPicture name={comment.author.name} picture={comment.author.picture.url} size="small" />
                <div className="flex flex-col">
                    <div className="rounded-lg bg-gray-100 p-2">
                        <div className="text-sm font-semibold">{comment.author.name}</div>
                        <div className="text-sm text-gray-500">{comment.content}</div>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                        <span onClick={handleLikeComment} className="cursor-pointer">
                            {isLiked ? "Unlike" : "Like"} {likes > 0 && `(${likes})`}
                        </span>
                        <span onClick={handleReplyClick} className="cursor-pointer">
                            Reply
                        </span>
                    </div>
                    {showReplyInput && (
                        <div className="mt-2 flex items-center">
                            <UserPicture name={user.name} picture={user.picture.url} size="small" />
                            <input
                                type="text"
                                value={newReplyContent}
                                onChange={(e) => setNewReplyContent(e.target.value)}
                                placeholder="Write a reply..."
                                className="flex-grow rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button onClick={handleAddReply} className="ml-2 text-blue-500">
                                Post
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Replies */}
            {replies.length > 0 && (
                <div className="ml-8 mt-2">
                    {!showReplies ? (
                        <div className="cursor-pointer text-xs text-blue-500" onClick={() => setShowReplies(true)}>
                            Show {replies.length} {replies.length > 1 ? "replies" : "reply"}
                        </div>
                    ) : (
                        replies.map((reply) => <CommentItem key={reply._id} comment={reply} user={user} />)
                    )}
                </div>
            )}
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
        <div className={"flex flex-col gap-6"}>
            {posts.map((post) => (
                <PostItem key={post._id} post={post} circle={circle} feed={feed} />
            ))}
        </div>
    );
};

export default PostList;

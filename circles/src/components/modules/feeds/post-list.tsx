"use client";

import { Circle, Content, Feed, PostDisplay } from "@/models/models";
import { UserPicture } from "../members/user-picture";
import { Button } from "@/components/ui/button";
import { Edit, Heart, MessageCircle, MoreVertical, Trash2 } from "lucide-react"; // Assuming you are using Lucide for icons
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { useEffect, useState } from "react";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { getPublishTime } from "@/lib/utils";
import { contentPreviewAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TextareaAutosize from "react-textarea-autosize";

type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
};

const PostItem = ({ post, circle }: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = getPublishTime(post?.createdAt);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
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
            likedBy: [],
            replies: [],
            createdAt: new Date().toISOString(),
        };
        setComments([...comments, newComment]);
        setNewCommentContent("");
        setShowAllComments(true); // Show all comments to see the new one
        // Simulate backend call
    };

    const handleCommentKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAddComment();
        }
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
                    {likes > 1 && <span>{likes}</span>}
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
                <div className="mt-2 flex items-start gap-2">
                    <UserPicture name={user?.name} picture={user?.picture?.url} size="small" />
                    <TextareaAutosize
                        value={newCommentContent}
                        onChange={(e) => setNewCommentContent(e.target.value)}
                        onKeyDown={handleCommentKeyDown}
                        placeholder="Write a comment..."
                        className="flex-grow resize-none rounded-[20px] bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        minRows={1}
                        maxRows={6}
                    />
                    {/* On mobile, show send button */}
                    {isMobile && (
                        <button onClick={handleAddComment} className="mt-1 text-blue-500">
                            Send
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// CommentItem Component
type CommentItemProps = {
    comment: any;
    user: any;
    depth?: number;
};

const CommentItem = ({ comment, user, depth = 0 }: CommentItemProps) => {
    const [showReplies, setShowReplies] = useState(false);
    const [replies, setReplies] = useState(comment.replies || []);
    const [likes, setLikes] = useState(comment.likes || 0);
    const [isLiked, setIsLiked] = useState(false);
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [newReplyContent, setNewReplyContent] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(comment.content);
    const isMobile = useIsMobile();

    const isAuthor = user && comment.author._id === user?._id;

    const formattedDate = getPublishTime(comment.createdAt);

    const handleLikeComment = () => {
        if (comment.author._id === user._id) return; // Can't like own comment

        if (isLiked) {
            setLikes((prev) => prev - 1);
            // Remove user from likedBy
            comment.likedBy = comment.likedBy.filter((id) => id !== user._id);
        } else {
            setLikes((prev) => prev + 1);
            // Add user to likedBy
            comment.likedBy.push(user._id);
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
            likedBy: [],
            replies: [],
            createdAt: new Date().toISOString(),
        };
        setReplies([...replies, newReply]);
        setNewReplyContent("");
        setShowReplyInput(false);
        setShowReplies(true); // Show replies after adding a reply
        // Simulate backend call
    };

    const handleReplyKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAddReply();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setShowReplyInput(false);
            setNewReplyContent("");
        }
    };

    const handleEditClick = () => {
        setIsEditing(true);
    };

    const handleDeleteClick = () => {
        // Simulate delete comment
    };

    const handleEditKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            // Save edited comment
            setIsEditing(false);
            // Simulate backend call
        } else if (e.key === "Escape") {
            e.preventDefault();
            setIsEditing(false);
            setEditContent(comment.content);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditContent(comment.content);
    };

    const handleCancelReply = () => {
        setShowReplyInput(false);
        setNewReplyContent("");
    };

    const [flatReplies, setFlatReplies] = useState([]);

    useEffect(() => {
        // Flatten replies
        const flattenReplies = (replies) => {
            let flatReplies = [];

            const traverse = (replies) => {
                for (let reply of replies) {
                    flatReplies.push(reply);
                    if (reply.replies && reply.replies.length > 0) {
                        traverse(reply.replies);
                    }
                }
            };

            traverse(replies);

            // Sort by createdAt
            flatReplies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            return flatReplies;
        };

        const flat = flattenReplies(replies);
        setFlatReplies(flat);
    }, [replies]);

    // Users who liked the comment (simulated)
    const likedByUsers = comment.likedBy || [];

    return (
        <div className={`flex flex-col ${depth > 0 ? "ml-8" : ""} mt-2`}>
            {/* Comment Content */}
            <div className="group flex items-start gap-2">
                <UserPicture name={comment.author.name} picture={comment.author.picture.url} size="small" />
                <div className="flex w-auto max-w-[80%] flex-col">
                    <div className="inline-block rounded-lg bg-gray-100 p-2">
                        <div className="text-sm font-semibold">{comment.author.name}</div>
                        {isEditing ? (
                            <TextareaAutosize
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                className="w-full resize-none rounded-[20px] bg-white p-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                minRows={1}
                                maxRows={6}
                            />
                        ) : (
                            <div className="text-sm text-gray-500">{comment.content}</div>
                        )}
                    </div>
                    {isEditing && (
                        <div className="mt-1 flex items-center gap-2">
                            <span className="cursor-pointer text-xs text-blue-500" onClick={handleCancelEdit}>
                                Cancel
                            </span>
                        </div>
                    )}
                    {!isEditing && (
                        <div className="mt-1 flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>{formattedDate}</span>
                                <span
                                    onClick={handleLikeComment}
                                    className={`cursor-pointer ${
                                        comment.author._id === user._id ? "text-gray-400" : ""
                                    }`}
                                >
                                    Like
                                </span>
                                <span onClick={handleReplyClick} className="cursor-pointer">
                                    Reply
                                </span>
                            </div>
                            {likes > 0 && (
                                <div className="flex items-center" title={likedByUsers.map((u) => u.name).join(", ")}>
                                    <Heart
                                        className={`h-4 w-4 ${isLiked ? "fill-current text-red-500" : "text-gray-500"}`}
                                    />
                                    {likes > 1 && <span className="ml-1 text-xs text-gray-500">{likes}</span>}
                                </div>
                            )}
                        </div>
                    )}
                    {showReplyInput && (
                        <div className="mt-2 flex flex-col">
                            <span className="mb-1 text-xs text-gray-500">Replying to {comment.author.name}</span>
                            <TextareaAutosize
                                value={newReplyContent}
                                onChange={(e) => setNewReplyContent(e.target.value)}
                                onKeyDown={handleReplyKeyDown}
                                placeholder="Write a reply..."
                                className="w-full resize-none rounded-[20px] bg-gray-100 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                minRows={1}
                                maxRows={6}
                            />
                            <div className="mt-1 flex items-center gap-2">
                                {/* On mobile, show send button */}
                                {isMobile && (
                                    <button onClick={handleAddReply} className="self-end text-blue-500">
                                        Send
                                    </button>
                                )}
                                <span className="cursor-pointer text-xs text-blue-500" onClick={handleCancelReply}>
                                    Cancel
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                {isAuthor && !isEditing && (
                    <div className="relative">
                        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100">
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
                        </div>
                    </div>
                )}
            </div>

            {/* Replies */}
            {replies.length > 0 && (
                <div className={`ml-8 mt-2`}>
                    {!showReplies ? (
                        <div className="cursor-pointer text-xs text-blue-500" onClick={() => setShowReplies(true)}>
                            Show {flatReplies.length} {flatReplies.length > 1 ? "replies" : "reply"}
                        </div>
                    ) : (
                        flatReplies.map((reply) => (
                            <CommentItem
                                key={reply._id}
                                comment={reply}
                                user={user}
                                depth={1} // Keep depth at 1
                            />
                        ))
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

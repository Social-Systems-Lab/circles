"use client";

import { Circle, Content, Feed, PostDisplay, CommentDisplay, Page } from "@/models/models";
import { UserPicture } from "../members/user-picture";
import { Button } from "@/components/ui/button";
import { Edit, Heart, Loader2, MessageCircle, MoreHorizontal, MoreVertical, Trash2 } from "lucide-react";
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { KeyboardEvent, useEffect, useState, useTransition } from "react";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { getPublishTime } from "@/lib/utils";
import { contentPreviewAtom, userAtom } from "@/lib/data/atoms";
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
import { MemberDisplay } from "@/models/models";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    createPostAction,
    createCommentAction,
    likeContentAction,
    unlikeContentAction,
    getReactionsAction,
    checkIfLikedAction,
    updatePostAction,
    deletePostAction,
} from "./actions";
import { Arrow } from "@radix-ui/react-popover";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import { start } from "repl";
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
import { CreateNewPost } from "./create-new-post";
import { EditPost } from "./edit-post";
import { useToast } from "@/components/ui/use-toast";
import { PostForm } from "./post-form";
import { isAuthorized } from "@/lib/auth/client-auth";
import { feedFeaturePrefix } from "@/lib/data/constants";

type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
    page: Page;
    subpage?: string;
};

const PostItem = ({ post, circle, feed, page, subpage }: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = getPublishTime(post?.createdAt);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [user] = useAtom(userAtom);
    const isAuthor = user && post.createdBy === user?.did;
    const canModerateFeature = feedFeaturePrefix + feed.handle + "_moderate";
    const canModerate = isAuthorized(user, circle, canModerateFeature);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const [openDropdown, setOpenDropdown] = useState(false);

    // State for likes
    const initialLikes = post.reactions.like || 0;
    const [likes, setLikes] = useState<number>(initialLikes);
    const [isLiked, setIsLiked] = useState<boolean>(false);
    const [likedByUsers, setLikedByUsers] = useState<Circle[] | undefined>(undefined);
    const [isLikesPopoverOpen, setIsLikesPopoverOpen] = useState(false);

    // State for comments
    const [comments, setComments] = useState<CommentDisplay[]>([]);
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

    useEffect(() => {
        // Check if the user has liked the post
        // TODO fix this to be done server-side when posts are fetched
        // const checkIfLiked = async () => {
        //     if (user) {
        //         try {
        //             const result = await checkIfLikedAction(post._id, "post");
        //             if (result.success) {
        //                 setIsLiked(result.isLiked || false);
        //             }
        //         } catch (error) {
        //             console.error("Failed to check if liked", error);
        //         }
        //     }
        // };
        // checkIfLiked();
    }, [post._id, user]);

    const handleContentClick = (content: Content) => {
        setContentPreview((x) => (x === content ? undefined : content));
    };

    const handleEditSubmit = async (formData: FormData) => {
        startTransition(async () => {
            const response = await updatePostAction(formData, page, subpage);

            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            } else {
                toast({
                    title: "Post updated successfully",
                    variant: "success",
                });
            }
            setOpenDropdown(false);
        });
    };

    const handleDeleteConfirm = async () => {
        startTransition(async () => {
            const response = await deletePostAction(post._id, page, subpage);

            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            } else {
                toast({
                    title: "Post deleted successfully",
                    variant: "success",
                });
            }
        });
    };

    const handleLikePost = () => {
        if (!user) return;

        startTransition(async () => {
            try {
                if (isLiked) {
                    const result = await unlikeContentAction(post._id, "post");
                    if (result.success) {
                        setLikes((prev) => prev - 1);
                        setIsLiked(false);
                    }
                } else {
                    const result = await likeContentAction(post._id, "post");
                    if (result.success) {
                        setLikes((prev) => prev + 1);
                        setIsLiked(true);
                    }
                }
            } catch (error) {
                console.error("Failed to like/unlike post", error);
            }
        });
    };

    const handleLikesPopoverHover = async (open: boolean) => {
        if (likedByUsers !== undefined || !open) return;
        startTransition(async () => {
            try {
                const result = await getReactionsAction(post._id, "post");
                if (result.success && result.reactions) {
                    setLikedByUsers(result.reactions);
                }
            } catch (error) {
                console.error("Failed to fetch likes", error);
            }
        });
    };

    const handleAddComment = () => {
        if (!newCommentContent.trim()) return;

        startTransition(async () => {
            try {
                const result = await createCommentAction(post._id, null, newCommentContent);
                if (result.success && result.comment) {
                    const newComment = result.comment as CommentDisplay;
                    newComment.author = user as Circle;

                    setComments([...comments, newComment]);
                    setNewCommentContent("");
                    setShowAllComments(true);
                }
            } catch (error) {
                console.error("Failed to add comment", error);
            }
        });
    };

    const handleCommentKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAddComment();
        }
    };

    useEffect(() => {
        // TODO fix this
        // const fetchComments = async () => {
        //     try {
        //         const response = await fetch(`/api/comments?postId=${post._id}`);
        //         const data = await response.json();
        //         setComments(data.comments);
        //     } catch (error) {
        //         console.error("Failed to fetch comments", error);
        //     }
        // };
        // fetchComments();
    }, [post._id]);

    return (
        <div className={`flex flex-col gap-4 ${isCompact ? "" : "rounded-[15px] border-0 shadow-lg"} bg-white`}>
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
                    {(isAuthor || canModerate) && (
                        <DropdownMenu modal={false} open={openDropdown} onOpenChange={setOpenDropdown}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {isAuthor && (
                                    <Dialog onOpenChange={(open) => setOpenDropdown(open)}>
                                        <DialogTrigger asChild>
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                <span>Edit</span>
                                            </DropdownMenuItem>
                                        </DialogTrigger>
                                        <DialogContent className="overflow-hidden rounded-[15px] p-0 sm:max-w-[425px] sm:rounded-[15px]">
                                            <PostForm
                                                circle={circle}
                                                feed={feed}
                                                user={user}
                                                initialPost={post}
                                                onSubmit={handleEditSubmit}
                                                onCancel={() => setOpenDropdown(false)}
                                            />
                                        </DialogContent>
                                    </Dialog>
                                )}
                                <Dialog onOpenChange={(open) => setOpenDropdown(open)}>
                                    <DialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            <span>Delete</span>
                                        </DropdownMenuItem>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Delete Post</DialogTitle>
                                            <DialogDescription>
                                                Are you sure you want to delete this post? This action cannot be undone.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <DialogFooter>
                                            <DialogClose asChild>
                                                <Button variant="outline">Cancel</Button>
                                            </DialogClose>
                                            <Button
                                                variant="destructive"
                                                onClick={handleDeleteConfirm}
                                                disabled={isPending}
                                            >
                                                {isPending ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Deleting...
                                                    </>
                                                ) : (
                                                    <>Delete</>
                                                )}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
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
                <div className="flex cursor-pointer items-center gap-1.5 text-gray-500">
                    {isLiked ? (
                        <AiFillHeart className={`h-5 w-5 text-[#ff4772]`} onClick={handleLikePost} />
                    ) : (
                        <AiOutlineHeart className={`h-5 w-5 text-gray-500`} onClick={handleLikePost} />
                    )}
                    {likes > 0 && (
                        <HoverCard openDelay={200} onOpenChange={(open) => handleLikesPopoverHover(open)}>
                            <HoverCardTrigger>
                                <span>{likes}</span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-auto border-0 bg-[#333333] p-2 pt-[6px]">
                                <HoverCardArrow className="text-[#333333]" fill="#333333" color="#333333" />
                                <div className="text-[14px] text-white">
                                    <div className="font-bold">Likes</div>
                                    {isPending && (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        </>
                                    )}

                                    {likedByUsers?.map((user) => (
                                        <div key={user.did} className="flex items-center gap-2 text-[12px]">
                                            {/* <UserPicture name={user.name} picture={user.picture?.url} size="small" /> */}
                                            <span>{user.name}</span>
                                        </div>
                                    ))}
                                    {likes > 20 && (
                                        <div className="text-sm text-gray-500">...and {likes - 20} more</div>
                                    )}
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                    )}
                </div>

                {/* Comments Section */}
                <div className="flex items-center gap-2 pl-4 pr-4">
                    <div className="flex items-center gap-1.5 text-gray-500">
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
                            ? comments.map((comment) => (
                                  <CommentItem key={comment._id} comment={comment} user={user} postId={post._id} />
                              ))
                            : post.highlightedComment && (
                                  <CommentItem
                                      key={post.highlightedComment._id}
                                      comment={post.highlightedComment}
                                      user={user}
                                      postId={post._id}
                                  />
                              )}
                    </>
                )}

                {/* Comment input box */}
                {user && (
                    <div className="mt-2 flex items-start gap-2">
                        <TextareaAutosize
                            value={newCommentContent}
                            onChange={(e) => setNewCommentContent(e.target.value)}
                            onKeyDown={handleCommentKeyDown}
                            placeholder="Write a comment..."
                            className="flex-grow resize-none rounded-[20px] bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            minRows={1}
                            maxRows={6}
                        />
                        {isMobile && (
                            <button onClick={handleAddComment} className="mt-1 text-blue-500">
                                Send
                            </button>
                        )}
                    </div>
                )}
            </div>
            {/* 
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <PostForm
                        circle={circle}
                        feed={feed}
                        user={user}
                        initialPost={post}
                        onSubmit={handleEditSubmit}
                        onCancel={() => setIsEditDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Post</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this post? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>Delete</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog> */}
        </div>
    );
};

// CommentItem Component
type CommentItemProps = {
    comment: CommentDisplay;
    user: any;
    postId: string;
    depth?: number;
};

const CommentItem = ({ comment, user, postId, depth = 0 }: CommentItemProps) => {
    const [showReplies, setShowReplies] = useState(false);
    const [replies, setReplies] = useState<CommentDisplay[]>([]);
    const [likes, setLikes] = useState<number>(comment.reactions.like || 0);
    const [isLiked, setIsLiked] = useState<boolean>(false);
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [newReplyContent, setNewReplyContent] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(comment.content);
    const isMobile = useIsMobile();
    const [likedByUsers, setLikedByUsers] = useState<Circle[]>([]);
    const [isLikesPopoverOpen, setIsLikesPopoverOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const isAuthor = user && comment.createdBy === user?.did;

    const formattedDate = getPublishTime(comment.createdAt);

    useEffect(() => {
        // Check if the user has liked the comment
        const checkIfLiked = async () => {
            // TODO fix this, should be done server-side when comments are fetched
            // if (user) {
            //     try {
            //         const result = await checkIfLikedAction(comment._id!, "comment");
            //         if (result.success) {
            //             setIsLiked(result.isLiked || false);
            //         }
            //     } catch (error) {
            //         console.error("Failed to check if liked", error);
            //     }
            // }
        };
        checkIfLiked();
    }, [comment._id, user]);

    const handleLikeComment = () => {
        if (!user || comment.createdBy === user.did) return;

        startTransition(async () => {
            try {
                if (isLiked) {
                    const result = await unlikeContentAction(comment._id!, "comment");
                    if (result.success) {
                        setLikes((prev) => prev - 1);
                        setIsLiked(false);
                    }
                } else {
                    const result = await likeContentAction(comment._id!, "comment");
                    if (result.success) {
                        setLikes((prev) => prev + 1);
                        setIsLiked(true);
                    }
                }
            } catch (error) {
                console.error("Failed to like/unlike comment", error);
            }
        });
    };

    const handleLikesPopoverOpen = async (open: boolean) => {
        setIsLikesPopoverOpen(open);
        if (open && likes > 0 && likedByUsers.length === 0) {
            try {
                const result = await getReactionsAction(comment._id!, "comment");
                if (result.success && result.reactions) {
                    setLikedByUsers(result.reactions);
                }
            } catch (error) {
                console.error("Failed to fetch likes", error);
            }
        }
    };

    const handleReplyClick = () => {
        setShowReplyInput(!showReplyInput);
    };

    const handleAddReply = () => {
        if (!newReplyContent.trim()) return;

        startTransition(async () => {
            try {
                const result = await createCommentAction(postId, comment._id ?? null, newReplyContent);
                if (result.success && result.comment) {
                    const newReply = result.comment as CommentDisplay;
                    setReplies([...replies, newReply]);
                    setNewReplyContent("");
                    setShowReplyInput(false);
                    setShowReplies(true);
                }
            } catch (error) {
                console.error("Failed to add reply", error);
            }
        });
    };

    const handleReplyKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
        // Implement delete comment
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            // Save edited comment
            setIsEditing(false);
            // Implement backend call to update comment
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

    useEffect(() => {
        // TODO fix this
        // const fetchReplies = async () => {
        //     try {
        //         const response = await fetch(`/api/comments?parentCommentId=${comment._id}`);
        //         const data = await response.json();
        //         setReplies(data.comments);
        //     } catch (error) {
        //         console.error("Failed to fetch replies", error);
        //     }
        // };
        // fetchReplies();
    }, [comment._id]);

    return (
        <div className={`flex flex-col ${depth > 0 ? "ml-8" : ""} mt-2`}>
            {/* Comment Content */}
            <div className="group flex items-start gap-2">
                <UserPicture name={comment.author.name} picture={comment.author.picture?.url} size="small" />
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
                                        comment.createdBy === user?.did ? "text-gray-400" : ""
                                    }`}
                                >
                                    Like
                                </span>
                                <span onClick={handleReplyClick} className="cursor-pointer">
                                    Reply
                                </span>
                            </div>
                            {likes > 0 && (
                                <Popover open={isLikesPopoverOpen} onOpenChange={handleLikesPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <div className="flex items-center">
                                            {isLiked ? (
                                                <AiFillHeart
                                                    className={`h-4 w-4 text-[#ff4772]`}
                                                    onClick={handleLikeComment}
                                                />
                                            ) : (
                                                <AiOutlineHeart
                                                    className={`h-4 w-4 text-gray-500`}
                                                    onClick={handleLikeComment}
                                                />
                                            )}
                                            {likes > 0 && <span className="ml-1 text-xs text-gray-500">{likes}</span>}
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent>
                                        <div>
                                            <h4 className="font-bold">Likes</h4>
                                            {likedByUsers.map((user) => (
                                                <div key={user.did} className="flex items-center gap-2">
                                                    <UserPicture
                                                        name={user.name}
                                                        picture={user.picture?.url}
                                                        size="small"
                                                    />
                                                    <span>{user.name}</span>
                                                </div>
                                            ))}
                                            {likes > 20 && (
                                                <div className="text-sm text-gray-500">...and {likes - 20} more</div>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
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
                            Show {replies.length} {replies.length > 1 ? "replies" : "reply"}
                        </div>
                    ) : (
                        replies.map((reply) => (
                            <CommentItem
                                key={reply._id}
                                comment={reply}
                                user={user}
                                postId={postId}
                                depth={depth + 1}
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
    page: Page;
    subpage?: string;
};

const PostList = ({ feed, circle, posts, page, subpage }: PostListProps) => {
    return (
        <div className={"flex flex-col gap-6"}>
            {posts.map((post) => (
                <PostItem key={post._id} post={post} circle={circle} feed={feed} page={page} subpage={subpage} />
            ))}
        </div>
    );
};

export default PostList;

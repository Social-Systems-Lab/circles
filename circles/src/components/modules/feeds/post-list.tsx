"use client";

import { Circle, Feed, PostDisplay, CommentDisplay, Page, PostItemProps, ContentPreviewData } from "@/models/models";
import { UserPicture } from "../members/user-picture";
import { Button } from "@/components/ui/button";
import { Edit, Loader2, MessageCircle, MoreHorizontal, MoreVertical, Trash2 } from "lucide-react";
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import {
    Dispatch,
    KeyboardEvent,
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
import { contentPreviewAtom, imageGalleryAtom, userAtom } from "@/lib/data/atoms";
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
    createCommentAction,
    likeContentAction,
    unlikeContentAction,
    getReactionsAction,
    updatePostAction,
    deletePostAction,
    getAllCommentsAction,
    editCommentAction,
    deleteCommentAction,
} from "./actions";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
import { useToast } from "@/components/ui/use-toast";
import { PostForm } from "./post-form";
import { isAuthorized } from "@/lib/auth/client-auth";
import { feedFeaturePrefix } from "@/lib/data/constants";

export const PostItem = ({
    post,
    circle,
    feed,
    page,
    subpage,
    inPreview,
    initialComments,
    initialShowAllComments,
}: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = getPublishTime(post?.createdAt);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [user] = useAtom(userAtom);
    const isAuthor = user && post.createdBy === user?.did;
    const canModerateFeature = feedFeaturePrefix + feed.handle + "_moderate";
    const canModerate = isAuthorized(user, circle, canModerateFeature);
    const [isPending, startTransition] = useTransition();
    const [isFetchingComments, startCommentsTransition] = useTransition();
    const { toast } = useToast();
    const [, setImageGallery] = useAtom(imageGalleryAtom);

    const [openDropdown, setOpenDropdown] = useState(false);

    // State for likes
    const initialLikes = post.reactions.like || 0;
    const [likes, setLikes] = useState<number>(initialLikes);
    const [isLiked, setIsLiked] = useState<boolean>(post.userReaction !== undefined);
    const [likedByUsers, setLikedByUsers] = useState<Circle[] | undefined>(undefined);

    // State for comments
    const [comments, setComments] = useState<CommentDisplay[]>(initialComments ?? []);
    const [showAllComments, setShowAllComments] = useState(initialShowAllComments ?? false);
    const [newCommentContent, setNewCommentContent] = useState("");

    const topLevelComments = useMemo(() => {
        if (!comments || comments.length <= 0) return [];

        let topComments = comments.filter((c) => c.parentCommentId === null);
        topComments.sort((a, b) => (b.reactions.like || 0) - (a.reactions.like || 0));
        return topComments;
    }, [comments]);

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

    const handleAuthorClick = (author: Circle) => {
        let contentPreviewData: ContentPreviewData = {
            type: "user",
            content: author,
        };
        setContentPreview((x) => (x?.content === author ? undefined : contentPreviewData));
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

        if (isLiked) {
            setLikes((prev) => prev - 1);
            setIsLiked(false);
        } else {
            setLikes((prev) => prev + 1);
            setIsLiked(true);
        }

        startTransition(async () => {
            try {
                if (isLiked) {
                    const result = await unlikeContentAction(post._id, "post");
                    if (!result.success) {
                        // fail silently for now
                    }
                } else {
                    const result = await likeContentAction(post._id, "post");
                    if (!result.success) {
                        // fail silently for now
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

    const onDeleteComment = (commentId: string) => {
        // TODO if top level comment anonymize it and if nested comment remove it
        setComments((prev) => prev.filter((c) => c._id !== commentId));
    };

    const handleImageClick = (index: number) => {
        if (post.media && post.media.length > 0) {
            // open content preview
            let contentPreviewData: ContentPreviewData = {
                type: "post",
                content: post,
                props: { post, circle, feed, page, subpage },
            };
            setContentPreview(contentPreviewData);
            setImageGallery({ images: post.media, initialIndex: index });
        }
    };

    const handlePostClick = () => {
        // open content preview
        let contentPreviewData: ContentPreviewData = {
            type: "post",
            content: post,
            props: { post, circle, feed, page, subpage, initialComments: comments, initialShowAllComments: true },
        };
        setContentPreview((x) => (x?.content === post ? undefined : contentPreviewData));
    };

    const fetchComments = useCallback(async () => {
        if (post.comments > 0 && comments.length === 0) {
            startCommentsTransition(async () => {
                try {
                    const result = await getAllCommentsAction(post._id);
                    if (result.success && result.comments) {
                        setComments(result.comments);
                        setShowAllComments(true);
                    }
                } catch (error) {
                    console.error("Failed to fetch comments", error);
                }
            });
        }
    }, [comments.length, post._id, post.comments]);

    useEffect(() => {
        if (initialShowAllComments && (initialComments === undefined || initialComments.length < post.comments)) {
            fetchComments();
        }
    }, [post.comments, initialComments, initialShowAllComments, fetchComments]);

    // fixes hydration error
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <div
            className={`flex flex-col gap-4 ${isCompact || inPreview ? "" : "rounded-[15px] border-0 shadow-lg"} bg-white`}
        >
            {/* Header with user information */}
            <div
                className="flex cursor-pointer items-center justify-between pl-4 pr-4 pt-4"
                onClick={(e) => {
                    e.stopPropagation();
                    handlePostClick();
                }}
            >
                <div className="flex items-center gap-4">
                    <UserPicture
                        name={post.author?.name}
                        picture={post.author?.picture?.url}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAuthorClick(post.author);
                        }}
                    />
                    <div className="flex flex-col">
                        <div
                            className="cursor-pointer font-semibold"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAuthorClick(post.author);
                            }}
                        >
                            {post.author?.name}
                        </div>
                        <div className="cursor-pointer text-sm text-gray-500">{formattedDate}</div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {(isAuthor || canModerate) && (
                        <DropdownMenu modal={false} open={openDropdown} onOpenChange={setOpenDropdown}>
                            <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={
                                        inPreview && !isMobile
                                            ? "absolute right-[55px] top-[8px] rounded-full"
                                            : "rounded-full"
                                    }
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {isAuthor && (
                                    <Dialog onOpenChange={(open) => setOpenDropdown(open)}>
                                        <DialogTrigger asChild>
                                            <DropdownMenuItem
                                                onSelect={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                }}
                                            >
                                                <Edit className="mr-2 h-4 w-4" />
                                                <div>Edit</div>
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
                                        <DropdownMenuItem
                                            onSelect={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                            }}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            <div>Delete</div>
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
                                            onClick={() => handleImageClick(index)}
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
                                <div>{likes}</div>
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
                                            <div>{user.name}</div>
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
                    <div className="flex cursor-pointer items-center gap-1.5 text-gray-500" onClick={fetchComments}>
                        <MessageCircle className="h-5 w-5" />
                        {post.comments > 0 && <div>{post.comments}</div>}
                    </div>
                </div>
            </div>

            {/* Comments Section */}
            <div className="flex flex-col gap-2 pb-4 pl-4 pr-4">
                {isFetchingComments ? (
                    <div className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading comments...
                    </div>
                ) : (
                    <>
                        {/* Show "Show more comments" if more than one comment and not showing all */}
                        {!showAllComments && post.comments > 1 && (
                            <div
                                className="cursor-pointer text-[15px] font-bold text-gray-500 hover:underline"
                                onClick={fetchComments}
                            >
                                Show more comments
                            </div>
                        )}
                    </>
                )}

                {/* Display comments */}
                {showAllComments
                    ? topLevelComments.map((comment) => (
                          <CommentItem
                              key={comment._id}
                              comment={comment}
                              comments={comments}
                              setComments={setComments}
                              user={user}
                              postId={post._id}
                              feed={feed}
                              circle={circle}
                              onDeleteComment={onDeleteComment}
                          />
                      ))
                    : post.highlightedComment && (
                          <CommentItem
                              key={post.highlightedComment._id}
                              comment={post.highlightedComment}
                              comments={comments}
                              setComments={setComments}
                              user={user}
                              postId={post._id}
                              feed={feed}
                              circle={circle}
                              onDeleteComment={onDeleteComment}
                              isHighlighted={true}
                          />
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
                <pre>{JSON.stringify(comments, null, 2)}</pre>
            </div>
        </div>
    );
};

// CommentItem Component
type CommentItemProps = {
    comment: CommentDisplay;
    user: any;
    postId: string;
    depth?: number;
    comments?: CommentDisplay[];
    setComments: Dispatch<SetStateAction<CommentDisplay[]>>;
    feed: Feed;
    circle: Circle;
    onDeleteComment: (commentId: string) => void;
    isHighlighted?: boolean;
};

const CommentItem = ({
    comment,
    comments,
    setComments,
    feed,
    circle,
    user,
    postId,
    onDeleteComment,
    isHighlighted,
    depth = 0,
}: CommentItemProps) => {
    const [showReplies, setShowReplies] = useState(false);
    const [likes, setLikes] = useState<number>(comment.reactions.like || 0);
    const [isLiked, setIsLiked] = useState<boolean>(comment.userReaction !== undefined);
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [newReplyContent, setNewReplyContent] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(comment.content);
    const isMobile = useIsMobile();
    const [likedByUsers, setLikedByUsers] = useState<Circle[]>([]);
    const [isLikesPopoverOpen, setIsLikesPopoverOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const isAuthor = user && comment.createdBy === user?.did;
    const canModerateFeature = feedFeaturePrefix + feed.handle + "_moderate";
    const canModerate = isAuthorized(user, circle, canModerateFeature);
    const formattedDate = getPublishTime(comment.createdAt);

    const replies = useMemo<CommentDisplay[]>(
        () =>
            (comments?.filter((c) => c.rootParentId === comment._id) || []).sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            ),
        [comments, comment._id],
    );

    const { toast } = useToast();

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
                    newReply.rootParentId = comment.rootParentId || comment._id;
                    setComments((prevComments: CommentDisplay[]) => [...prevComments, newReply]);

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
        startTransition(async () => {
            const result = await deleteCommentAction(comment._id!);
            if (result.success) {
                toast({
                    title: "Comment deleted",
                    variant: "success",
                });
                onDeleteComment(comment._id!);
            } else {
                toast({
                    title: result.message,
                    variant: "destructive",
                });
            }
        });
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            setIsEditing(false);

            // implement backend call to update comment
            startTransition(async () => {
                const result = await editCommentAction(comment._id!, editContent);
                if (result.success) {
                    setIsEditing(false);
                    toast({
                        title: "Comment updated",
                        variant: "success",
                    });
                } else {
                    // Handle failure (e.g., show toast message)
                    toast({
                        title: result.message,
                        variant: "destructive",
                    });
                }
            });
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

    const fetchReplies = async () => {
        setShowReplies(true);
    };

    return (
        <div className={`flex flex-col ${depth > 0 ? "ml-5" : ""} mt-2`}>
            {/* Comment Content */}
            <div className="group flex items-start gap-2">
                <div className="pt-1">
                    {comment.isDeleted ? (
                        <div className="h-[32px] w-[32px] rounded-full bg-gray-100" />
                    ) : (
                        <UserPicture name={comment.author.name} picture={comment.author.picture?.url} size="32px" />
                    )}
                </div>
                <div className="flex w-auto max-w-[80%] flex-col">
                    <div className="inline-block rounded-[15px] bg-gray-100 p-2">
                        {comment.isDeleted ? (
                            <div className="text-sm text-gray-400">Comment removed</div>
                        ) : (
                            <>
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
                                    <div className="text-sm">{comment.content}</div>
                                )}
                            </>
                        )}
                    </div>
                    {isEditing && (
                        <div className="mt-1 flex items-center gap-2">
                            <div className="cursor-pointer text-xs text-blue-500" onClick={handleCancelEdit}>
                                Cancel
                            </div>
                        </div>
                    )}
                    {!isEditing && !comment.isDeleted && (
                        <div className="mt-1 flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                <div>{formattedDate}</div>
                                {comment.createdBy !== user?.did && (
                                    <div
                                        onClick={handleLikeComment}
                                        className={isLiked ? `cursor-pointer text-[#ff4772]` : `cursor-pointer`}
                                    >
                                        Like
                                    </div>
                                )}
                                <div onClick={handleReplyClick} className="cursor-pointer">
                                    Reply
                                </div>
                            </div>
                        </div>
                    )}
                    {likes > 0 && (
                        <div className="relative self-end">
                            <div className="absolute bottom-[16px] left-[-16px] rounded-[15px] bg-white">
                                <Popover open={isLikesPopoverOpen} onOpenChange={handleLikesPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <div className="flex items-center">
                                            <AiFillHeart
                                                className={`h-4 w-4 text-[#ff4772]`}
                                                onClick={handleLikeComment}
                                            />
                                            {likes > 0 && <div className="ml-1 text-xs text-gray-500">{likes}</div>}
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
                                                    <div>{user.name}</div>
                                                </div>
                                            ))}
                                            {likes > 20 && (
                                                <div className="text-sm text-gray-500">...and {likes - 20} more</div>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    )}

                    {showReplyInput && (
                        <div className="mt-2 flex flex-col">
                            <div className="mb-1 text-xs text-gray-500">Replying to {comment.author.name}</div>
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
                                <div className="cursor-pointer text-xs text-blue-500" onClick={handleCancelReply}>
                                    Cancel
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {(isAuthor || canModerate) && !isEditing && (
                    <div className="relative">
                        <div className="absolute left-[-5px] top-0 opacity-0 group-hover:opacity-100">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="rounded-full">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {isAuthor && (
                                        <DropdownMenuItem onClick={handleEditClick}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            <div>Edit</div>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={handleDeleteClick}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        <div>Delete</div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                )}
            </div>

            {/* Replies */}
            {/* Only show for top level comments since we flattened the hierarchy beyond */}
            {!isHighlighted && !comment.parentCommentId && (comment.replies > 0 || replies?.length > 0) && (
                <div className={`ml-8 mt-2`}>
                    {!showReplies ? (
                        <div
                            className="cursor-pointer pl-2 text-xs font-bold text-gray-500 hover:underline"
                            onClick={fetchReplies}
                        >
                            Show {comment.replies} {comment.replies > 1 ? "replies" : "reply"}
                        </div>
                    ) : (
                        replies?.map((reply) => (
                            <CommentItem
                                key={reply._id}
                                comment={reply}
                                user={user}
                                postId={postId}
                                comments={comments}
                                setComments={setComments}
                                depth={depth + 1}
                                feed={feed}
                                circle={circle}
                                onDeleteComment={onDeleteComment}
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
            {/* <pre>{JSON.stringify(posts, null, 2)}</pre> */}
        </div>
    );
};

export default PostList;

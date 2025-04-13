"use client";

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
import {
    Circle,
    CommentDisplay,
    ContentPreviewData,
    Feed, // Keep Feed if needed by CommentItem, otherwise remove
    MentionDisplay,
    UserPrivate,
} from "@/models/models";
import { Button } from "@/components/ui/button";
import { Edit, Heart, Loader2, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { getPublishTime } from "@/lib/utils";
import { contentPreviewAtom, sidePanelContentVisibleAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TextareaAutosize from "react-textarea-autosize";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    createCommentAction,
    likeContentAction,
    unlikeContentAction,
    getReactionsAction,
    getAllCommentsAction,
    editCommentAction,
    deleteCommentAction,
    searchCirclesAction, // Keep if mentions are used
} from "./actions"; // Assuming actions are in the same directory
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
import { useToast } from "@/components/ui/use-toast";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import { MentionsInput, Mention, MentionItem, SuggestionDataItem } from "react-mentions";
import RichText from "./RichText";
import { UserPicture } from "../members/user-picture";
import { useRouter } from "next/navigation";
import {
    defaultMentionsInputStyle,
    defaultMentionStyle,
    handleMentionQuery,
    renderCircleSuggestion,
    LikeButton, // Import LikeButton if used within CommentItem
} from "./post-list"; // Import shared elements from post-list

// --- Comment Content Component ---
const MemoizedCommentContent = memo(({ content, mentions }: { content: string; mentions?: MentionDisplay[] }) => (
    <div className="text-sm">
        <RichText content={content} mentions={mentions} />
    </div>
));
MemoizedCommentContent.displayName = "MemoizedCommentContent";

// --- CommentItem Component (Extracted and adapted) ---
type CommentItemProps = {
    comment: CommentDisplay;
    user: UserPrivate | null; // Use UserPrivate or Circle based on your user type
    postId: string;
    depth?: number;
    comments?: CommentDisplay[]; // Full list of comments for finding replies
    setComments: Dispatch<SetStateAction<CommentDisplay[]>>;
    circle: Circle; // Circle context for permissions
    onDeleteComment: (commentId: string) => void; // Callback for deletion
    isHighlighted?: boolean; // If the comment is specifically highlighted
};

const CommentItem = ({
    comment,
    comments,
    setComments,
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
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const router = useRouter();

    const isAuthor = user && comment.createdBy === user?.did;
    const canModerate = isAuthorized(user ?? undefined, circle, features.feed.moderate); // Assuming feed moderation applies here
    const formattedDate = getPublishTime(comment.createdAt);

    // Find replies specific to this comment
    const replies = useMemo<CommentDisplay[]>(
        () =>
            (comments?.filter((c) => c.parentCommentId === comment._id) || []).sort(
                // Changed logic to find direct children
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            ),
        [comments, comment._id],
    );

    const { toast } = useToast();

    const handleAuthorClick = (author: Circle) => {
        if (isMobile) {
            router.push(`/circles/${author.handle}`);
            return;
        }
        let contentPreviewData: ContentPreviewData = { type: "user", content: author };
        setContentPreview((x) =>
            x?.content === author && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const handleLikeComment = () => {
        if (!user || comment.createdBy === user.did) return;

        // Optimistic update
        const originalLiked = isLiked;
        const originalLikes = likes;
        setIsLiked(!originalLiked);
        setLikes(originalLiked ? originalLikes - 1 : originalLikes + 1);

        startTransition(async () => {
            try {
                const action = originalLiked ? unlikeContentAction : likeContentAction;
                const result = await action(comment._id!, "comment");
                if (!result.success) {
                    // Revert on failure
                    setIsLiked(originalLiked);
                    setLikes(originalLikes);
                    toast({ title: "Error", description: result.message || "Action failed", variant: "destructive" });
                }
            } catch (error) {
                // Revert on error
                setIsLiked(originalLiked);
                setLikes(originalLikes);
                console.error("Failed to like/unlike comment", error);
                toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
            }
        });
    };

    const handleLikesPopoverOpen = async (open: boolean) => {
        setIsLikesPopoverOpen(open);
        if (open && likes > 0 && likedByUsers.length === 0) {
            // Consider adding a loading state here
            try {
                const result = await getReactionsAction(comment._id!, "comment");
                if (result.success && result.reactions) {
                    setLikedByUsers(result.reactions);
                }
            } catch (error) {
                console.error("Failed to fetch likes", error);
                // Handle error display if needed
            }
        }
    };

    const handleReplyClick = () => {
        setShowReplyInput(!showReplyInput);
        setNewReplyContent(""); // Clear content when toggling
    };

    const handleAddReply = () => {
        if (!newReplyContent.trim() || isPending) return;

        const replyContent = newReplyContent.trim();
        setNewReplyContent(""); // Clear input immediately
        setShowReplyInput(false); // Hide input immediately

        const tempComment: CommentDisplay = {
            _id: `temp-reply-${Date.now()}`, // More unique temp ID
            content: replyContent,
            createdAt: new Date(),
            author: user as Circle, // Assuming user is Circle type when logged in
            createdBy: user!.did!,
            postId: postId,
            reactions: {},
            parentCommentId: comment._id!,
            rootParentId: comment.rootParentId || comment._id, // Propagate root parent ID
            replies: 0,
        };

        // Add temporary reply optimistically
        setComments((prevComments = []) => [...prevComments, tempComment]);
        setShowReplies(true); // Ensure replies section is visible

        startTransition(async () => {
            try {
                const result = await createCommentAction(postId, comment._id!, replyContent); // Pass parentCommentId
                if (result.success && result.comment) {
                    const newReply = result.comment as CommentDisplay;
                    newReply.author = user as Circle; // Populate author locally
                    newReply.rootParentId = comment.rootParentId || comment._id; // Ensure rootParentId is set

                    // Replace temp comment with actual comment
                    setComments((prevComments = []) =>
                        prevComments.map((c) => (c._id === tempComment._id ? newReply : c)),
                    );
                } else {
                    // Remove temp comment on failure
                    setComments((prevComments = []) => prevComments.filter((c) => c._id !== tempComment._id));
                    toast({
                        title: "Reply Failed",
                        description: result.message || "Failed to post reply.",
                        variant: "destructive",
                    });
                }
            } catch (error) {
                // Remove temp comment on error
                setComments((prevComments = []) => prevComments.filter((c) => c._id !== tempComment._id));
                console.error("Failed to add reply", error);
                toast({ title: "Reply Failed", description: "An error occurred.", variant: "destructive" });
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
        setEditContent(comment.content); // Ensure edit content is reset to current comment content
        setIsEditing(true);
    };

    const handleDeleteClick = () => {
        if (isPending) return;
        startTransition(async () => {
            const result = await deleteCommentAction(comment._id!);
            if (result.success) {
                toast({ title: "Comment deleted", variant: "success" });
                onDeleteComment(comment._id!); // Use callback to update parent state
            } else {
                toast({ title: "Delete Failed", description: result.message, variant: "destructive" });
            }
        });
    };

    const handleEditSubmit = () => {
        if (isPending || editContent === comment.content) {
            setIsEditing(false); // Just close if no change
            return;
        }

        const originalContent = comment.content;
        // Optimistic update
        setComments((prevComments = []) =>
            prevComments.map((c) => (c._id === comment._id ? { ...c, content: editContent } : c)),
        );
        setIsEditing(false);

        startTransition(async () => {
            const result = await editCommentAction(comment._id!, editContent);
            if (!result.success) {
                // Revert on failure
                setComments((prevComments = []) =>
                    prevComments.map((c) => (c._id === comment._id ? { ...c, content: originalContent } : c)),
                );
                toast({ title: "Update Failed", description: result.message, variant: "destructive" });
            } else {
                // Action succeeded, optimistic update is already done. Just show toast.
                toast({ title: "Comment updated", variant: "success" });
            }
        });
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleEditSubmit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            handleCancelEdit();
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

    const toggleReplies = () => {
        setShowReplies(!showReplies);
        // Potentially fetch replies here if not already loaded
    };

    return (
        <div className={`flex flex-col ${depth > 0 ? "ml-5" : ""} mt-2`}>
            {/* Comment Content */}
            <div className="group flex items-start gap-2">
                <div className="pt-1">
                    {comment.isDeleted ? (
                        <div className="h-[32px] w-[32px] rounded-full bg-gray-100" />
                    ) : (
                        <UserPicture
                            name={comment.author.name}
                            picture={comment.author.picture?.url}
                            circleType={comment.author.circleType}
                            onClick={() => handleAuthorClick(comment.author)}
                            size="32px"
                        />
                    )}
                </div>
                <div className="flex w-auto max-w-[80%] flex-col">
                    {" "}
                    {/* Constrain width */}
                    <div className="inline-block rounded-[15px] bg-gray-100 p-2">
                        {comment.isDeleted ? (
                            <div className="text-sm text-gray-400">Comment removed</div>
                        ) : (
                            <>
                                <div
                                    className="cursor-pointer text-sm font-semibold"
                                    onClick={() => handleAuthorClick(comment.author)}
                                >
                                    {comment.author.name}
                                </div>
                                {isEditing ? (
                                    <MentionsInput
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        onKeyDown={handleEditKeyDown}
                                        placeholder="Edit comment..."
                                        className="flex-grow rounded-[20px] bg-gray-200" // Slightly different bg for editing
                                        style={defaultMentionsInputStyle}
                                        autoFocus
                                    >
                                        <Mention
                                            trigger="@"
                                            data={handleMentionQuery}
                                            style={defaultMentionStyle}
                                            displayTransform={(id, display) => `${display}`}
                                            renderSuggestion={renderCircleSuggestion}
                                            markup="[__display__](/circles/__id__)"
                                        />
                                    </MentionsInput>
                                ) : (
                                    <MemoizedCommentContent
                                        content={comment.content}
                                        mentions={comment.mentionsDisplay}
                                    />
                                )}
                            </>
                        )}
                    </div>
                    {isEditing && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                            Press Esc to{" "}
                            <span className="cursor-pointer text-blue-500" onClick={handleCancelEdit}>
                                cancel
                            </span>{" "}
                            • Enter to{" "}
                            <span className="cursor-pointer text-blue-500" onClick={handleEditSubmit}>
                                save
                            </span>
                        </div>
                    )}
                    {!isEditing && !comment.isDeleted && (
                        <div className="mt-1 flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                <div>{formattedDate}</div>
                                {user &&
                                    comment.createdBy !== user?.did && ( // Only show like if not author
                                        <div
                                            onClick={handleLikeComment}
                                            className={`cursor-pointer font-medium ${isLiked ? "text-[#ff4772]" : "hover:underline"}`}
                                        >
                                            Like
                                        </div>
                                    )}
                                <div onClick={handleReplyClick} className="cursor-pointer font-medium hover:underline">
                                    Reply
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Likes Popover */}
                    {likes > 0 && !comment.isDeleted && (
                        <div className="relative self-end">
                            <div className="absolute bottom-[16px] left-[-16px] rounded-[15px] bg-white shadow-md">
                                {" "}
                                {/* Added shadow */}
                                <Popover open={isLikesPopoverOpen} onOpenChange={handleLikesPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <div className="flex cursor-pointer items-center p-1">
                                            <AiFillHeart className="h-3 w-3 text-[#ff4772]" />
                                            <div className="ml-1 text-xs text-gray-600">{likes}</div>
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2 text-xs">
                                        <div className="font-semibold">Likes</div>
                                        {likedByUsers.length > 0 ? (
                                            likedByUsers.map((u) => (
                                                <div key={u.did} className="mt-1">
                                                    {u.name}
                                                </div>
                                            ))
                                        ) : (
                                            <Loader2 className="mt-1 h-3 w-3 animate-spin" />
                                        )}
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    )}
                    {/* Reply Input Area */}
                    {showReplyInput && (
                        <div className="mt-2 flex flex-col">
                            {/* Optional: Add "Replying to..." */}
                            <MentionsInput
                                value={newReplyContent}
                                onChange={(e) => setNewReplyContent(e.target.value)}
                                onKeyDown={handleReplyKeyDown}
                                placeholder="Write a reply..."
                                className="flex-grow rounded-[20px] bg-gray-100" // Consistent style
                                style={defaultMentionsInputStyle}
                                autoFocus
                            >
                                <Mention
                                    trigger="@"
                                    data={handleMentionQuery}
                                    style={defaultMentionStyle}
                                    displayTransform={(id, display) => `${display}`}
                                    renderSuggestion={renderCircleSuggestion}
                                    markup="[__display__](/circles/__id__)"
                                />
                            </MentionsInput>
                            <div className="mt-1 flex items-center gap-2 text-xs">
                                Press Esc to{" "}
                                <span className="cursor-pointer text-blue-500" onClick={handleCancelReply}>
                                    cancel
                                </span>{" "}
                                • Enter to{" "}
                                <span className="cursor-pointer text-blue-500" onClick={handleAddReply}>
                                    reply
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Edit/Delete Dropdown */}
                {(isAuthor || canModerate) && !isEditing && !comment.isDeleted && (
                    <div className="relative ml-auto self-start opacity-0 transition-opacity group-hover:opacity-100">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {isAuthor && (
                                    <DropdownMenuItem onClick={handleEditClick}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        <span>Edit</span>
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={handleDeleteClick} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            {/* Replies Section */}
            {comment.replies > 0 &&
                !comment.parentCommentId && ( // Only show toggle for top-level comments with replies
                    <div className={`ml-8 mt-1`}>
                        {showReplies &&
                            replies.map((reply) => (
                                <CommentItem
                                    key={reply._id}
                                    comment={reply}
                                    user={user}
                                    postId={postId}
                                    comments={comments} // Pass down the full list
                                    setComments={setComments}
                                    depth={depth + 1}
                                    circle={circle}
                                    onDeleteComment={onDeleteComment}
                                />
                            ))}
                        <div
                            className="cursor-pointer pl-2 text-xs font-bold text-gray-500 hover:underline"
                            onClick={toggleReplies}
                        >
                            {showReplies ? "Hide" : "Show"} {comment.replies}{" "}
                            {comment.replies > 1 ? "replies" : "reply"}
                        </div>
                    </div>
                )}
        </div>
    );
};

// --- Main CommentSection Component ---
interface CommentSectionProps {
    postId: string; // ID of the shadow post
    circle: Circle; // Circle context for permissions
    user: UserPrivate | null; // Current user
    initialCommentCount?: number; // Optional initial count to avoid extra fetch if 0
}

export const CommentSection: React.FC<CommentSectionProps> = ({ postId, circle, user, initialCommentCount = -1 }) => {
    const [comments, setComments] = useState<CommentDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newCommentContent, setNewCommentContent] = useState("");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isPending, startTransition] = useTransition(); // For optimistic updates
    const { toast } = useToast();
    const isMobile = useIsMobile();

    const canComment = isAuthorized(user ?? undefined, circle, features.feed.comment); // Check comment permission

    // Fetch comments when component mounts or postId changes
    useEffect(() => {
        if (!postId || initialCommentCount === 0) {
            setComments([]); // Clear comments if no postId or count is 0
            return;
        }

        const fetchComments = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const result = await getAllCommentsAction(postId);
                if (result.success && result.comments) {
                    setComments(result.comments);
                } else {
                    setError(result.message || "Failed to load comments.");
                    setComments([]); // Clear comments on error
                }
            } catch (err) {
                console.error("Failed to fetch comments", err);
                setError("An unexpected error occurred while loading comments.");
                setComments([]); // Clear comments on exception
            } finally {
                setIsLoading(false);
            }
        };

        fetchComments();
    }, [postId, initialCommentCount]); // Rerun if postId or initial count changes

    const topLevelComments = useMemo(() => {
        return comments
            .filter((c) => !c.parentCommentId) // Filter for top-level comments
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Sort by creation time
    }, [comments]);

    const handleAddComment = () => {
        if (!newCommentContent.trim() || isSubmittingComment || !user) return;

        const commentContent = newCommentContent.trim();
        setNewCommentContent(""); // Clear input immediately
        setIsSubmittingComment(true); // Disable input/button

        const tempComment: CommentDisplay = {
            _id: `temp-comment-${Date.now()}`,
            content: commentContent,
            createdAt: new Date(),
            author: user as Circle, // Assuming user is Circle type
            createdBy: user.did!,
            postId: postId,
            reactions: {},
            parentCommentId: null,
            replies: 0,
        };

        // Optimistic update: Add temporary comment
        setComments((prev) => [...prev, tempComment]);

        startTransition(async () => {
            try {
                const result = await createCommentAction(postId, null, commentContent);
                if (result.success && result.comment) {
                    const newComment = result.comment as CommentDisplay;
                    newComment.author = user as Circle; // Populate author locally

                    // Replace temp comment with actual comment
                    setComments((prev) => prev.map((c) => (c._id === tempComment._id ? newComment : c)));
                } else {
                    // Remove temp comment on failure
                    setComments((prev) => prev.filter((c) => c._id !== tempComment._id));
                    toast({
                        title: "Comment Failed",
                        description: result.message || "Failed to post comment.",
                        variant: "destructive",
                    });
                }
            } catch (error) {
                // Remove temp comment on error
                setComments((prev) => prev.filter((c) => c._id !== tempComment._id));
                console.error("Exception adding comment:", error);
                toast({ title: "Comment Failed", description: "An error occurred.", variant: "destructive" });
            } finally {
                setIsSubmittingComment(false); // Re-enable input/button
            }
        });
    };

    const handleCommentKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAddComment();
        }
    };

    // Callback for CommentItem to update state when a comment is deleted
    const onDeleteComment = (commentId: string) => {
        setComments((prev) => prev.filter((c) => c._id !== commentId && c.parentCommentId !== commentId)); // Remove comment and its direct replies
        // Note: This doesn't handle nested replies removal optimistically. A full refetch might be simpler or more robust backend handling.
    };

    return (
        <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <h3 className="mb-2 text-lg font-semibold">Comments</h3>
            {isLoading && (
                <div className="flex items-center justify-center text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading comments...
                </div>
            )}
            {error && <div className="text-red-600">{error}</div>}

            {!isLoading && !error && (
                <>
                    {/* Display comments */}
                    {topLevelComments.length > 0 ? (
                        topLevelComments.map((comment) => (
                            <CommentItem
                                key={comment._id}
                                comment={comment}
                                comments={comments} // Pass the full list for reply lookup
                                setComments={setComments} // Pass setter for optimistic updates in replies/edits
                                user={user}
                                postId={postId}
                                circle={circle}
                                onDeleteComment={onDeleteComment} // Pass deletion handler
                            />
                        ))
                    ) : (
                        <div className="text-sm text-gray-500">No comments yet.</div>
                    )}

                    {/* Comment input box */}
                    {user && canComment && (
                        <div className="mt-4 flex items-start gap-2 border-t pt-4">
                            <UserPicture
                                name={user.name}
                                picture={user.picture?.url}
                                circleType={user.circleType}
                                size="32px"
                            />
                            <div className="flex-grow">
                                <MentionsInput
                                    value={newCommentContent}
                                    onChange={(e) => setNewCommentContent(e.target.value)}
                                    onKeyDown={handleCommentKeyDown}
                                    placeholder="Write a comment..."
                                    className="flex-grow rounded-[20px] bg-gray-100" // Use flex-grow here
                                    style={defaultMentionsInputStyle}
                                    disabled={isSubmittingComment}
                                >
                                    <Mention
                                        trigger="@"
                                        data={handleMentionQuery}
                                        style={defaultMentionStyle}
                                        displayTransform={(id, display) => `${display}`}
                                        renderSuggestion={renderCircleSuggestion}
                                        markup="[__display__](/circles/__id__)"
                                    />
                                </MentionsInput>
                                {isMobile && (
                                    <Button
                                        onClick={handleAddComment}
                                        disabled={isSubmittingComment || !newCommentContent.trim()}
                                        size="sm"
                                        className="mt-2"
                                    >
                                        {isSubmittingComment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Send
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    {!user && <div className="mt-4 text-sm text-gray-500">Log in to comment.</div>}
                </>
            )}
        </div>
    );
};

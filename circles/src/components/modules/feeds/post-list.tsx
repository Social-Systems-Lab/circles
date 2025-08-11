// post-list.tsx - component for displaying a list of posts
"use client";

import {
    Circle,
    Feed,
    PostDisplay,
    CommentDisplay,
    PostItemProps,
    ContentPreviewData,
    MentionDisplay,
    Cause as SDG,
} from "@/models/models";
import { sdgs } from "@/lib/data/sdgs";
import { UserPicture } from "../members/user-picture";
import { CirclePicture } from "../circles/circle-picture";
import { Button } from "@/components/ui/button";
import { Edit, Heart, Loader2, MessageCircle, MoreHorizontal, MoreVertical, Trash2, Users } from "lucide-react"; // Added Users
import { Badge } from "@/components/ui/badge"; // Added Badge import
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
    createCommentAction,
    likeContentAction,
    unlikeContentAction,
    getReactionsAction,
    updatePostAction,
    deletePostAction,
    getAllCommentsAction,
    editCommentAction,
    deleteCommentAction,
    searchCirclesAction,
} from "./actions";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
import { useToast } from "@/components/ui/use-toast";
import { PostForm } from "./post-form";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { MentionsInput, Mention, MentionItem, SuggestionDataItem } from "react-mentions";
import { over, set } from "lodash";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import RichText from "./RichText";
import UserBadge from "../users/user-badge";
import { motion } from "framer-motion";
import { ListFilter } from "@/components/utils/list-filter";
import { useRouter } from "next/navigation";
import Indicators, { ProximityIndicator, SimilarityScore } from "@/components/utils/indicators";
import Image from "next/image"; // Import Next Image
import { Card, CardContent } from "@/components/ui/card"; // Import Card components
import Link from "next/link"; // Import Next Link
import InternalLinkPreview from "./InternalLinkPreview"; // Import InternalLinkPreview

export const defaultMentionsInputStyle = {
    control: {
        backgroundColor: "rgb(243 244 246)", // Tailwind bg-gray-100
        borderRadius: "1.25rem", // Tailwind rounded-[20px]
    },
    input: {
        padding: "0.5rem 1rem", // Tailwind p-2 pl-4
        outline: "none",
    },
    highlighter: {
        padding: "0.5rem 1rem", // Same as input
    },
    suggestions: {
        control: {
            backgroundColor: "transparent",
        },
        list: {
            backgroundColor: "transparent",
            border: "0px solid rgba(0,0,0,0.15)",
            borderRadius: "15px",
            fontSize: 14,
            overflow: "hidden",
        },
        item: {
            backgroundColor: "white",
            padding: "5px 15px",
            // borderBottom: "1px solid rgba(0,0,0,0.15)",
            "&focused": {
                backgroundColor: "#cee4e5",
            },
        },
    },
};

export const defaultMentionStyle = {
    backgroundColor: "#e5e9ff",
};

export const renderCircleSuggestion = (
    suggestion: any,
    search: string,
    highlightedDisplay: React.ReactNode,
    index: number,
    focused: boolean,
) => (
    <div className="flex items-center p-2">
        <img
            src={suggestion.picture || "/default-profile.png"}
            alt={suggestion.display}
            className="mr-2 h-6 w-6 rounded-full"
        />
        <span>{highlightedDisplay}</span>
    </div>
);

export const handleMentionQuery = async (query: string, callback: (data: SuggestionDataItem[]) => void) => {
    //console.log("fetching mentions", query);
    const response = await searchCirclesAction(encodeURIComponent(query));
    if (!response?.success) {
        return;
    }
    let suggestions =
        response.circles?.map((circle) => ({
            id: circle._id,
            display: circle.name,
            picture: circle.picture?.url,
        })) ?? [];
    callback(suggestions);
};

type LikeButtonProps = {
    isLiked: boolean;
    onClick: () => void;
};

export const LikeButton = ({ isLiked, onClick }: LikeButtonProps) => {
    return (
        <button
            onClick={onClick}
            className="relative flex h-5 w-5 items-center justify-center focus:outline-none"
            aria-label={isLiked ? "Unlike" : "Like"}
        >
            <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: isLiked ? [1, 1.2, 1] : 1, opacity: isLiked ? [1, 1, 0] : 1 }}
                transition={{ duration: 0.3 }}
            >
                <AiOutlineHeart
                    className={`h-5 w-5 transition-colors duration-300 ${
                        isLiked ? "fill-[#ff4772] stroke-[#ff4772]" : "stroke-gray-400"
                    }`}
                />
            </motion.div>
            {isLiked && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1] }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 flex items-center justify-center"
                >
                    <AiFillHeart className="h-5 w-5 fill-[#ff4772] stroke-[#ff4772]" />
                </motion.div>
            )}
        </button>
    );
};

const MemoizedPostContent = memo(({ content, mentions }: { content: string; mentions?: MentionDisplay[] }) => (
    // Use break-words (overflow-wrap) and min-w-0
    <div className="formatted min-w-0 break-words pl-4 pr-4 text-lg">
        <RichText content={content} mentions={mentions} />
    </div>
));

MemoizedPostContent.displayName = "MemoizedPostContent";

// In post-list.tsx, add this near the other memoized components at the top

const MemoizedCommentContent = memo(({ content, mentions }: { content: string; mentions?: MentionDisplay[] }) => (
    <div className="text-sm">
        <RichText content={content} mentions={mentions} />
    </div>
));

MemoizedCommentContent.displayName = "MemoizedCommentContent";

// --- Link Preview Card Component (Defined Outside PostItem) ---
type LinkPreviewCardProps = {
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
};

const LinkPreviewCard = ({ url, title, description, imageUrl }: LinkPreviewCardProps) => {
    const hostname = useMemo(() => {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return "";
        }
    }, [url]);

    // Corrected JSX structure and added min-w-0 to the anchor tag
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block min-w-0" // Added min-w-0
            onClick={(e) => e.stopPropagation()} // Prevent post click handler
        >
            <Card className="overflow-hidden transition-colors hover:bg-gray-50">
                <CardContent className="flex flex-col gap-0 p-0 md:flex-row">
                    {imageUrl && (
                        <div className="relative h-32 w-full flex-shrink-0 md:h-auto md:w-40">
                            <Image
                                src={imageUrl}
                                alt={title || "Link preview image"}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 160px"
                            />
                        </div>
                    )}
                    {/* Added min-w-0 to allow text content to wrap/truncate within flex item */}
                    <div className="flex min-w-0 flex-col justify-center p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{hostname}</div>
                        {title && <div className="mt-1 line-clamp-2 font-semibold">{title}</div>}
                        {description && <div className="mt-1 line-clamp-2 text-sm text-gray-500">{description}</div>}
                    </div>
                </CardContent>
            </Card>
        </a>
    );
};
// --- End Link Preview Card Component ---

export const PostItem = ({
    post,
    circle,
    feed,
    inPreview,
    initialComments,
    initialShowAllComments,
    isAggregateFeed,
    hideContent,
    embedded,
    disableComments,
}: PostItemProps) => {
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const formattedDate = getPublishTime(post?.createdAt);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [user] = useAtom(userAtom);
    const isAuthor = user && post.createdBy === user?.did;
    const canModerate = circle && isAuthorized(user, circle, features.feed.moderate);
    const canComment = circle && isAuthorized(user, circle, features.feed.comment);
    const [isPending, startTransition] = useTransition();
    const [isFetchingComments, startCommentsTransition] = useTransition();
    const { toast } = useToast();
    const [, setImageGallery] = useAtom(imageGalleryAtom);
    const [focusPost, setFocusPost] = useAtom(focusPostAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const router = useRouter();

    const [openDropdown, setOpenDropdown] = useState(false);

    // Determine user group name if applicable
    const userGroupName = useMemo(() => {
        if (
            circle?.userGroups &&
            post.userGroups &&
            post.userGroups.length > 0 &&
            !post.userGroups.includes("everyone")
        ) {
            const groupHandle = post.userGroups[0]; // Assuming only one group for now
            const group = circle.userGroups.find((ug) => ug.handle === groupHandle);
            return group?.name;
        }
        return undefined;
    }, [post.userGroups, circle?.userGroups]);

    const populatedSdgs = useMemo(() => {
        if (!post.sdgs || post.sdgs.length === 0) return [];
        if (typeof post.sdgs[0] === "object" && post.sdgs[0] !== null && "handle" in post.sdgs[0]) {
            return post.sdgs as SDG[];
        }
        const sdgIds = post.sdgs as string[];
        return sdgs.filter((sdg) => sdgIds.includes(sdg._id!));
    }, [post.sdgs]);

    // State for likes
    const initialLikes = post.reactions.like || 0;
    const [likes, setLikes] = useState<number>(initialLikes);
    const [isLiked, setIsLiked] = useState<boolean>(post.userReaction !== undefined);
    const [likedByUsers, setLikedByUsers] = useState<Circle[] | undefined>(undefined);

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
        if (!focusPost) return;
        if (focusPost._id !== post._id) {
            return;
        }

        // TODO scroll to post

        let contentPreviewData: ContentPreviewData = {
            type: "post",
            content: post,
            props: { post, circle, feed, initialComments: comments, initialShowAllComments: true },
        };
        setContentPreview((x) =>
            x?.content === post && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );

        setFocusPost((x) => undefined);
    }, [focusPost, setFocusPost, post, circle, feed, comments, setContentPreview, sidePanelContentVisible]); // Added dependencies

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
        if (isMobile) {
            // Otherwise use the standard route
            router.push(`/circles/${author.handle}`);
            return;
        }

        let contentPreviewData: ContentPreviewData = {
            type: "user",
            content: author,
        };
        setContentPreview((x) =>
            x?.content === author && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const handleCircleClick = (targetCircle: Circle) => {
        if (isMobile) {
            // Otherwise use the standard route
            router.push(`/circles/${targetCircle.handle}`);
            return;
        }

        let contentPreviewData: ContentPreviewData = {
            type: "circle", // Assuming 'circle' type exists or use 'user' if appropriate
            content: targetCircle,
        };
        setContentPreview((x) =>
            x?.content === targetCircle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const handleEditSubmit = async (formData: FormData) => {
        startTransition(async () => {
            const response = await updatePostAction(formData);

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
            const response = await deletePostAction(post._id);

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
                    // Check the state *before* the optimistic update
                    const result = await unlikeContentAction(post._id, "post");
                    if (!result.success) {
                        // Revert optimistic update on failure
                        setLikes((prev) => prev + 1);
                        setIsLiked(true);
                        console.error("Failed to unlike post:", result.message);
                    }
                } else {
                    const result = await likeContentAction(post._id, "post");
                    if (!result.success) {
                        // Revert optimistic update on failure
                        setLikes((prev) => prev - 1);
                        setIsLiked(false);
                        console.error("Failed to like post:", result.message);
                    }
                }
            } catch (error) {
                // Revert optimistic update on error
                if (isLiked) {
                    // Check original state before optimistic update
                    setLikes((prev) => prev + 1);
                    setIsLiked(true);
                } else {
                    setLikes((prev) => prev - 1);
                    setIsLiked(false);
                }
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

    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    const handleAddComment = () => {
        if (!newCommentContent.trim() || isSubmittingComment) return;

        const commentContent = newCommentContent.trim();
        // Clear the input immediately to improve user experience
        setNewCommentContent("");
        setIsSubmittingComment(true);

        const tempComment: CommentDisplay = {
            _id: "temp-comment", // Temporary ID to distinguish it
            content: commentContent,
            createdAt: new Date(),
            author: user as Circle,
            createdBy: user!.did!,
            postId: post._id,
            reactions: {},
            parentCommentId: null,
            replies: 0,
        };
        setComments([...comments, tempComment]);
        setShowAllComments(true);

        startTransition(async () => {
            try {
                console.log("Submitting comment:", commentContent.substring(0, 50));
                const result = await createCommentAction(post._id, null, commentContent);

                if (result.success && result.comment) {
                    const newComment = result.comment as CommentDisplay;
                    newComment.author = user as Circle;

                    setComments((prev) => prev.map((c) => (c._id === "temp-comment" ? newComment : c)));
                    setShowAllComments(true);
                    console.log("Comment created successfully:", newComment._id);
                } else {
                    console.error("Failed to add comment. Server response:", result);
                    setComments((prev) => prev.filter((comment) => comment._id !== "temp-comment"));
                    // Show error to user
                    toast({
                        title: "Comment Failed",
                        description: result.message || "Failed to create comment. Please try again.",
                        variant: "destructive",
                    });
                }
            } catch (error) {
                console.error("Exception adding comment:", error);
                setComments((prev) => prev.filter((comment) => comment._id !== "temp-comment"));
                // Show error to user
                toast({
                    title: "Comment Failed",
                    description: "An error occurred while creating your comment.",
                    variant: "destructive",
                });
            } finally {
                setIsSubmittingComment(false);
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
            if (!isMobile) {
                let contentPreviewData: ContentPreviewData = {
                    type: "post",
                    content: post,
                    props: {
                        post,
                        circle,
                        feed,
                        initialComments: comments,
                        initialShowAllComments: true,
                    },
                };
                setContentPreview(contentPreviewData);
            }
            setImageGallery({ images: post.media, initialIndex: index });
        }
    };

    const handlePostClick = () => {
        // open content preview
        let contentPreviewData: ContentPreviewData = {
            type: "post",
            content: post,
            props: { post, circle, feed, initialComments: comments, initialShowAllComments: true },
        };
        setContentPreview((x) =>
            x?.content === post && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
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
    }, [comments.length, post._id, post.comments, startCommentsTransition]); // Added startCommentsTransition

    useEffect(() => {
        if (initialShowAllComments && (initialComments === undefined || initialComments.length < post.comments)) {
            fetchComments();
        }
    }, [post.comments, initialComments, initialShowAllComments, fetchComments]);

    // useEffect(() => {
    //     console.log("re-rendering post-list");
    // }, []);

    // fixes hydration error
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        // Added min-w-0 and overflow-hidden to allow shrinking and clip content
        <div
            className={`flex min-w-0 flex-col gap-4 overflow-hidden ${
                isCompact || inPreview || embedded ? "" : "rounded-[15px] border-0 shadow-lg"
            } ${embedded ? "" : "bg-white"}`}
        >
            {/* Header with user information */}
            {!hideContent && (
                <div
                    className="flex cursor-pointer items-center justify-between pl-4 pr-4 pt-4"
                    onClick={(e) => {
                        e.stopPropagation();
                        handlePostClick();
                    }}
                >
                    {isAggregateFeed && post.circle && post.circle._id !== post.author._id ? (
                        // New layout for aggregate feed posts in a different circle
                        <div className="flex items-center gap-4">
                            <div className="relative h-10 w-10">
                                <CirclePicture circle={post.circle} size="40px" openPreview={true} />
                                <div
                                    className="absolute bottom-[-4px] right-[-4px] cursor-pointer rounded-full border-2 border-white"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAuthorClick(post.author);
                                    }}
                                >
                                    <UserPicture
                                        name={post.author.name}
                                        picture={post.author.picture?.url}
                                        size="24px"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <div
                                    className="flex cursor-pointer flex-row items-center font-semibold"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCircleClick(post.circle!); // post.circle is checked in condition
                                    }}
                                >
                                    {post.circle.name}
                                    {userGroupName && (
                                        <Badge variant="secondary" className="ml-2">
                                            {userGroupName}
                                        </Badge>
                                    )}
                                </div>
                                <div
                                    className="cursor-pointer text-sm text-gray-500"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAuthorClick(post.author);
                                    }}
                                >
                                    {post.author.name} • {formattedDate}
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Original layout
                        <div className="flex items-center gap-4">
                            <UserPicture
                                name={post.author?.name}
                                picture={post.author?.picture?.url}
                                circleType={post.author?.circleType}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAuthorClick(post.author);
                                }}
                            />
                            <div className="flex flex-col">
                                <div
                                    className="flex cursor-pointer flex-row items-center font-semibold"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAuthorClick(post.author);
                                    }}
                                >
                                    <UserBadge user={post.author} />
                                    {userGroupName && (
                                        <Badge variant="secondary" className="ml-2">
                                            {userGroupName}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex cursor-pointer items-center text-sm text-gray-500">
                                    {formattedDate}
                                </div>
                            </div>
                        </div>
                    )}

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
                                            <DialogContent
                                                className="overflow-hidden rounded-[15px] p-0 sm:max-w-[425px] sm:rounded-[15px]"
                                                onInteractOutside={(e) => {
                                                    e.preventDefault();
                                                }}
                                            >
                                                <div className="hidden">
                                                    <DialogTitle>Edit post</DialogTitle>
                                                </div>
                                                <PostForm
                                                    user={user!}
                                                    initialPost={post}
                                                    onSubmit={async (formData, targetCircleId) => {
                                                        // When editing, targetCircleId is the post's original circle.
                                                        // updatePostAction uses postId from formData.
                                                        // The circleId for updatePostAction is derived from the post object
                                                        // or not strictly needed if only postId is used.
                                                        // We ensure handleEditSubmit is called correctly.
                                                        // If handleEditSubmit needs targetCircleId, pass post.circle._id!
                                                        // For now, assuming handleEditSubmit only needs formData.
                                                        await handleEditSubmit(formData);
                                                    }}
                                                    onCancel={() => setOpenDropdown(false)}
                                                    moduleHandle="feed"
                                                    createFeatureHandle="post" // Or "edit" if a specific edit feature exists
                                                    itemKey="post"
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
                                        <DialogContent
                                            onInteractOutside={(e) => {
                                                e.preventDefault();
                                            }}
                                        >
                                            <DialogHeader>
                                                <DialogTitle>Delete Post</DialogTitle>
                                                <DialogDescription>
                                                    Are you sure you want to delete this post? This action cannot be
                                                    undone.
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
            )}

            {/* Post content */}
            {!hideContent && <MemoizedPostContent content={post.content} mentions={post.mentionsDisplay} />}

            {/* --- Link Preview --- */}
            {!hideContent && (post.internalPreviewUrl || post.linkPreviewUrl) && (
                <div className="pl-4 pr-4">
                    {/* Render Internal Preview if URL exists, passing pre-fetched data */}
                    {post.internalPreviewUrl ? (
                        <InternalLinkPreview url={post.internalPreviewUrl} initialData={post.internalPreviewData} />
                    ) : // Otherwise, render External Preview if URL exists
                    post.linkPreviewUrl ? (
                        <LinkPreviewCard
                            url={post.linkPreviewUrl}
                            title={post.linkPreviewTitle}
                            description={post.linkPreviewDescription}
                            imageUrl={post.linkPreviewImage?.url}
                        />
                    ) : null}
                </div>
            )}
            {/* --- End Link Preview --- */}

            {/* Media carousel (if exists) */}
            {!hideContent && post.media && post.media.length > 0 && (
                <div className="relative h-64 w-full rounded-lg pl-4 pr-4">
                    {/* Keep padding */}
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
                            <div className="absolute bottom-[7px] flex flex-row items-center justify-center">
                                {post.media.map((_, index) => (
                                    <button
                                        key={index}
                                        onClick={() => carouselApi?.scrollTo(index)}
                                        className={`mx-1 h-1.5 w-1.5 rounded-full ${
                                            index === currentImageIndex ? "bg-blue-500" : "bg-gray-300"
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Actions (like and comment) */}
            <div className="flex items-center justify-between pl-4 pr-4 text-gray-500">
                <div className="flex flex-1 items-center gap-1.5">
                    {/* Likes Section */}
                    <div className="flex h-[24px] cursor-pointer items-center gap-1.5 text-gray-500">
                        <LikeButton isLiked={isLiked} onClick={handleLikePost} />
                        {likes > 0 && (
                            <HoverCard openDelay={200} onOpenChange={(open) => handleLikesPopoverHover(open)}>
                                <HoverCardTrigger>
                                    <div>{likes}</div>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-auto border-0 bg-[#333333] p-2 pt-[6px]">
                                    <HoverCardArrow className="text-[#333333]" fill="#333333" color="#333333" />
                                    <div className="text-[14px] text-white">
                                        <div className="font-bold">Likes</div>
                                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {likedByUsers?.map((user) => (
                                            <div key={user.did} className="flex items-center gap-2 text-[12px]">
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
                    {/* SDGs */}
                    {populatedSdgs.length > 0 && (
                        <div className="flex -space-x-2 pl-2">
                            {populatedSdgs.slice(0, 3).map((sdg) => (
                                <Image
                                    key={sdg.handle}
                                    src={sdg.picture?.url ?? "/images/default-picture.png"}
                                    alt={sdg.name}
                                    width={20}
                                    height={20}
                                    className="h-5 w-5 rounded-full border-2 border-white object-cover"
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Metrics */}
                {post.metrics && (
                    <div className="flex flex-1 items-center justify-center gap-1.5">
                        {post.metrics.similarity !== undefined && (
                            <div className="text-[16px]">
                                <SimilarityScore score={post.metrics.similarity} color={"#6b7280"} size={"1.25rem"} />
                            </div>
                        )}
                        {post.metrics.distance !== undefined && (
                            <div className="text-[16px]">
                                <ProximityIndicator
                                    distance={post.metrics.distance}
                                    color={"#6b7280"}
                                    content={post}
                                    size={"1.25rem"}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Comments Section */}
                <div className="flex flex-1 cursor-pointer items-center justify-end gap-1.5" onClick={fetchComments}>
                    <MessageCircle className="h-5 w-5" />
                    {post.comments > 0 && <div>{post.comments}</div>}
                </div>
            </div>

            {/* Comments Section */}
            <div className={`flex flex-col gap-2 ${embedded ? "pb-2" : "pb-4"} pl-4 pr-4`}>
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
                              setShowAllComments={setShowAllComments}
                              user={user}
                              postId={post._id}
                              feed={feed}
                              circle={circle}
                              onDeleteComment={onDeleteComment}
                              onShowAllComments={fetchComments}
                          />
                      ))
                    : post.highlightedComment && (
                          <CommentItem
                              key={post.highlightedComment._id}
                              comment={post.highlightedComment}
                              comments={comments}
                              setComments={setComments}
                              setShowAllComments={setShowAllComments}
                              user={user}
                              postId={post._id}
                              feed={feed}
                              circle={circle}
                              onDeleteComment={onDeleteComment}
                              isHighlighted={true}
                              onShowAllComments={fetchComments}
                          />
                      )}

                {/* Comment input box */}
                {user && canComment && !disableComments && (
                    <div className="mt-2 flex items-start gap-2">
                        <MentionsInput
                            value={newCommentContent}
                            onChange={(e) => setNewCommentContent(e.target.value)}
                            onKeyDown={handleCommentKeyDown}
                            placeholder="Write a comment..."
                            className="flex-grow rounded-[20px] bg-gray-100"
                            style={defaultMentionsInputStyle}
                        >
                            <Mention
                                trigger="@"
                                data={handleMentionQuery}
                                style={defaultMentionStyle}
                                displayTransform={(id, display) => `${display}`}
                                renderSuggestion={renderCircleSuggestion}
                                markup="[__display__](/circles/__id__)"
                                // regex={/\[([^\]]+)\]\(\/circles\/([^)]+)\)/} // TODO probably not necessary let's see
                            />
                        </MentionsInput>

                        {isMobile && (
                            <button onClick={handleAddComment} className="mt-1 text-blue-500">
                                Send
                            </button>
                        )}
                    </div>
                )}
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
    setShowAllComments: Dispatch<SetStateAction<boolean>>;
    feed: Feed;
    circle: Circle;
    onDeleteComment: (commentId: string) => void;
    isHighlighted?: boolean;
    onShowAllComments: () => void;
};

const CommentItem = ({
    comment,
    comments,
    setComments,
    setShowAllComments,
    onShowAllComments,
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
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const router = useRouter();

    const isAuthor = user && comment.createdBy === user?.did;
    const canModerate = isAuthorized(user, circle, features.feed.moderate);
    const formattedDate = getPublishTime(comment.createdAt);

    const replies = useMemo<CommentDisplay[]>(
        () =>
            (comments?.filter((c) => c.rootParentId === comment._id) || []).sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            ),
        [comments, comment._id],
    );

    const { toast } = useToast();

    const handleAuthorClick = (author: Circle) => {
        if (isMobile) {
            // Otherwise use the standard route
            router.push(`/circles/${author.handle}`);
            return;
        }

        let contentPreviewData: ContentPreviewData = {
            type: "user",
            content: author,
        };
        setContentPreview((x) =>
            x?.content === author && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

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

        const tempComment: CommentDisplay = {
            _id: "temp-reply", // Temporary ID to distinguish it
            content: newReplyContent,
            createdAt: new Date(),
            author: user as Circle,
            createdBy: user!.did!,
            postId: postId,
            reactions: {},
            parentCommentId: comment._id!,
            rootParentId: comment.rootParentId || comment._id,
            replies: 0,
        };

        setComments([...comments!, tempComment]);
        startTransition(async () => {
            try {
                const result = await createCommentAction(postId, comment._id ?? null, newReplyContent);
                if (result.success && result.comment) {
                    const newReply = result.comment as CommentDisplay;
                    newReply.rootParentId = comment.rootParentId || comment._id;
                    setComments((prevComments: CommentDisplay[]) =>
                        prevComments.map((c) => (c._id === "temp-reply" ? newReply : c)),
                    );

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

            const oldComment: CommentDisplay = { ...comment };
            const updatedComment: CommentDisplay = { ...comment, content: editContent };
            setComments((prevComments) => prevComments.map((c) => (c._id === comment._id ? updatedComment : c)));

            // TODO handle editing of highlighted comment

            // update comment
            startTransition(async () => {
                const result = await editCommentAction(comment._id!, editContent);
                if (result.success) {
                    setIsEditing(false);
                    // TODO get updated comment with mentions and update it in UI
                    toast({
                        title: "Comment updated",
                        variant: "success",
                    });
                } else {
                    // Handle failure (e.g., show toast message)
                    setComments((prevComments) => prevComments.map((c) => (c._id === comment._id ? oldComment : c)));
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
        if (isHighlighted) {
            // fetch all comments
            onShowAllComments();
        }
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
                    <div className="inline-block rounded-[15px] bg-gray-100 p-2">
                        {comment.isDeleted ? (
                            <div className="text-sm text-gray-400">Comment removed</div>
                        ) : (
                            <>
                                <div
                                    className="cursor-pointer text-sm font-semibold"
                                    onClick={() => handleAuthorClick(comment.author)}
                                >
                                    <UserBadge user={comment.author} />
                                </div>
                                {isEditing ? (
                                    <>
                                        <MentionsInput
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            onKeyDown={handleEditKeyDown}
                                            placeholder="Write a comment..."
                                            className="flex-grow rounded-[20px] bg-gray-200"
                                            style={defaultMentionsInputStyle}
                                        >
                                            <Mention
                                                trigger="@"
                                                data={handleMentionQuery}
                                                style={defaultMentionStyle}
                                                displayTransform={(id, display) => `${display}`}
                                                renderSuggestion={renderCircleSuggestion}
                                                markup="[__display__](/circles/__id__)"
                                                // regex={/\[([^\]]+)\]\(\/circles\/([^)]+)\)/} // TODO probably not necessary let's see
                                            />
                                        </MentionsInput>
                                    </>
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
            {!comment.parentCommentId && (comment.replies > 0 || replies?.length > 0) && (
                <div className={`ml-8 mt-2`}>
                    {showReplies &&
                        replies?.map((reply) => (
                            <CommentItem
                                key={reply._id}
                                comment={reply}
                                user={user}
                                postId={postId}
                                comments={comments}
                                setComments={setComments}
                                setShowAllComments={setShowAllComments}
                                depth={depth + 1}
                                feed={feed}
                                circle={circle}
                                onDeleteComment={onDeleteComment}
                                onShowAllComments={onShowAllComments}
                            />
                        ))}
                    {(!showReplies || isHighlighted) && (
                        <div
                            className="cursor-pointer pl-2 text-xs font-bold text-gray-500 hover:underline"
                            onClick={fetchReplies}
                        >
                            Show {comment.replies} {comment.replies > 1 ? "replies" : "reply"}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

type PostListProps = {
    feed?: Feed;
    circle?: Circle;
    posts: PostDisplay[];
    isAggregateFeed?: boolean;
};

const PostList = ({ feed, circle, posts, isAggregateFeed }: PostListProps) => {
    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.PostList.1");
        }
    }, []);

    return (
        <div className={"flex flex-col gap-6"}>
            {posts.map((post) => (
                <PostItem
                    key={post._id}
                    post={post}
                    circle={isAggregateFeed ? post.circle! : circle!}
                    feed={isAggregateFeed ? post.feed! : feed!}
                    isAggregateFeed={isAggregateFeed}
                />
            ))}
        </div>
    );
};

export default PostList;

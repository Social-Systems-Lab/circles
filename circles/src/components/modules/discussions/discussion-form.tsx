"use client";

// discussion-form.tsx
import React, { useState, useCallback, useEffect, useTransition, useRef, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    ImageIcon,
    MapPinIcon,
    BarChartIcon,
    Trash2,
    Loader2,
    MapPin,
    ChevronDown,
    Users,
    Globe,
    X,
} from "lucide-react";
import { UserPicture } from "../members/user-picture";
import {
    Circle,
    Feed,
    Location,
    Media,
    PostDisplay,
    UserPrivate,
    ProposalDisplay,
    IssueDisplay,
    TaskDisplay,
    Cause as SDG,
} from "@/models/models";
import {
    CreatableItemKey,
    CreatableItemDetail,
    creatableItemsList,
} from "@/components/global-create/global-create-dialog-content";
import { CirclePicture } from "../circles/circle-picture";
import CircleSelector from "@/components/global-create/circle-selector";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    type CarouselApi,
} from "@/components/ui/carousel";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import LocationPicker from "@/components/forms/location-picker";
import SdgFilter from "@/components/modules/search/sdg-filter";
import { useAtom } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";
import { Mention, MentionsInput } from "react-mentions";
import {
    defaultMentionsInputStyle,
    defaultMentionStyle,
    handleMentionQuery,
    renderCircleSuggestion,
} from "../feeds/post-list";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { userAtom } from "@/lib/data/atoms";
import {
    getLinkPreviewAction,
    getInternalLinkPreviewData,
    InternalLinkPreviewResult,
    getVerificationStatusAction,
    createPostAction,
    updatePostAction,
} from "../feeds/actions";
import { useToast } from "@/components/ui/use-toast";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import InternalLinkPreview from "../feeds/InternalLinkPreview";
import { truncateText } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, CircleHelp, Info } from "lucide-react";

function debounce<F extends (...args: any[]) => any>(
    func: F,
    waitFor: number,
): [(...args: Parameters<F>) => ReturnType<F>, () => void] {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<F>): ReturnType<F> => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
        }, waitFor);
        return undefined as ReturnType<F>;
    };
    const cancel = () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };
    return [debounced, cancel];
}

type LinkPreviewData = {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    mediaType?: string;
    contentType?: string;
    favicons?: string[];
};

type InternalPreviewDisplayData = {
    type: "circle" | "post" | "proposal" | "issue" | "task";
    id: string;
    url: string;
    data: Circle | PostDisplay | ProposalDisplay | IssueDisplay | TaskDisplay;
};

const postMentionsInputStyle = {
    control: {
        backgroundColor: "rgb(255 255 255)",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        minHeight: "400px",
    },
    input: {
        padding: "0 0",
        outline: "none",
        fontSize: "1.25rem",
        lineHeight: "1.875rem",
        paddingLeft: "0.75rem",
        paddingTop: "0.75rem",
        overflowWrap: "break-word" as const,
        wordBreak: "break-word" as const,
    },
    highlighter: {
        padding: "0 0",
        paddingLeft: "0.75rem",
        paddingTop: "0.75rem",
        fontSize: "1.25rem",
        lineHeight: "1.875rem",
        overflowWrap: "break-word" as const,
        wordBreak: "break-word" as const,
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
            "&focused": {
                backgroundColor: "#cee4e5",
            },
        },
    },
};

type ImageItem = {
    file?: File;
    preview: string;
    media?: Media;
};

type PostFormProps = {
    initialPost?: PostDisplay;
    moduleHandle: string;
    createFeatureHandle: string;
    itemKey: CreatableItemKey;
    initialSelectedCircleId?: string;
};

export function DiscussionForm({
    initialPost,
    moduleHandle,
    createFeatureHandle,
    itemKey,
    initialSelectedCircleId,
}: PostFormProps) {
    const [user] = useAtom(userAtom);
    const [postContent, setPostContent] = useState(initialPost?.content || "");
    const [title, setTitle] = useState(initialPost?.title || "");
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(initialSelectedCircleId || null);
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const [isPending, startTransition] = useTransition();
    const [location, setLocation] = useState<Location | undefined>(initialPost?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const [userGroups, setUserGroups] = useState<string[]>(initialPost?.userGroups || ["everyone"]);
    const [isUserGroupsDialogOpen, setIsUserGroupsDialogOpen] = useState(false);
    const [selectedSdgs, setSelectedSdgs] = useState<SDG[]>(initialPost?.sdgs || []);
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isActuallySubmitting = isSubmitting || isPending;

    const itemDetail: CreatableItemDetail | undefined = useMemo(
        () => creatableItemsList.find((item) => item.key === itemKey),
        [itemKey],
    );

    const handleCircleSelected = useCallback(
        (circle: Circle | null) => {
            setSelectedCircleId(circle?._id || null);
            setSelectedCircle(circle);
            setUserGroups(["everyone"]);
        },
        [setSelectedCircleId, setSelectedCircle, setUserGroups], // State setters are stable, can be []
    );

    useEffect(() => {
        if (!user) return;

        if (selectedCircleId) {
            if (user.did && user._id === selectedCircleId) {
                setSelectedCircle(user as Circle);
            } else {
                // If CircleSelector passes the full Circle object via onCircleSelected's second param,
                // this else block might not be needed or could be simplified.
                // For now, we rely on selectedCircle being updated by onCircleSelected.
            }
        } else {
            setSelectedCircle(null);
        }
    }, [selectedCircleId, user]);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const newImages = acceptedFiles.map((file) => ({
                file,
                preview: URL.createObjectURL(file),
            }));
            setImages((prevImages) => [...prevImages, ...newImages]);
            setDragging(false);
            setTimeout(() => {
                if (carouselApi) {
                    carouselApi.scrollTo(images.length + newImages.length - 1);
                }
            }, 0);
        },
        [carouselApi, images.length, setImages],
    );

    const removeImage = (index: number) => {
        setImages((prevImages) => {
            const newImages = [...prevImages];
            const removedImage = newImages.splice(index, 1)[0];
            if (removedImage.file) {
                URL.revokeObjectURL(removedImage.preview);
            }
            if (carouselApi) {
                setTimeout(() => carouselApi.scrollTo(Math.max(0, index - 1)), 0);
            }
            return newImages;
        });
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
        onDragEnter: () => setDragging(true),
        onDragLeave: () => setDragging(false),
        onDropAccepted: () => setDragging(false),
        noClick: true,
    });

    const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(
        initialPost?.linkPreviewUrl
            ? {
                  url: initialPost.linkPreviewUrl,
                  title: initialPost.linkPreviewTitle,
                  description: initialPost.linkPreviewDescription,
                  image: initialPost.linkPreviewImage?.url,
              }
            : null,
    );
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [detectedUrl, setDetectedUrl] = useState<string | null>(
        initialPost?.linkPreviewUrl || initialPost?.internalPreviewUrl || null,
    );
    const fetchPreviewController = useRef<AbortController | null>(null);

    const [internalPreview, setInternalPreview] = useState<InternalPreviewDisplayData | null>(null);
    const [isInternalPreviewLoading, setIsInternalPreviewLoading] = useState(false);
    const fetchInternalPreviewController = useRef<AbortController | null>(null);
    const [previewRemovedManually, setPreviewRemovedManually] = useState(false);
    const cancelExternalFetchRef = useRef<() => void>(() => {});
    const cancelInternalFetchRef = useRef<() => void>(() => {});

    const extractFirstUrl = (text: string): { url: string; isInternal: boolean } | null => {
        const externalUrlRegex = /(https?:\/\/[^\s]+)/g;
        const internalUrlRegex = /(\/circles\/[a-zA-Z0-9\-\/]+)/g;
        const internalMatches = text.match(internalUrlRegex);
        if (internalMatches) {
            const url = internalMatches[0];
            const postRegex = /^\/circles\/[a-zA-Z0-9\-]+\/post\/[a-zA-Z0-9]+$/;
            const proposalRegex = /^\/circles\/[a-zA-Z0-9\-]+\/proposals\/[a-zA-Z0-9]+$/;
            const issueRegex = /^\/circles\/[a-zA-Z0-9\-]+\/issues\/[a-zA-Z0-9]+$/;
            const circleRegex = /^\/circles\/[a-zA-Z0-9\-]+(?:\/(?!post|proposals|issues).*)?$/;
            if (postRegex.test(url) || proposalRegex.test(url) || issueRegex.test(url) || circleRegex.test(url)) {
                return { url: url, isInternal: true };
            }
        }
        const externalMatches = text.match(externalUrlRegex);
        if (externalMatches) {
            return { url: externalMatches[0], isInternal: false };
        }
        return null;
    };

    const fetchExternalLinkPreview = useCallback(
        async (url: string) => {
            if (fetchPreviewController.current) fetchPreviewController.current.abort();
            const controller = new AbortController();
            fetchPreviewController.current = controller;
            setIsPreviewLoading(true);
            setLinkPreview(null);
            setInternalPreview(null);
            try {
                const result = await getLinkPreviewAction(url);
                if (controller.signal.aborted) return;
                if (result.success && result.preview) {
                    setLinkPreview(result.preview);
                    setDetectedUrl(result.preview.url);
                } else {
                    setDetectedUrl(url);
                    setLinkPreview(null);
                }
            } catch (error: any) {
                if (error.name !== "AbortError") {
                    setDetectedUrl(url);
                    setLinkPreview(null);
                }
            } finally {
                if (fetchPreviewController.current === controller) {
                    setIsPreviewLoading(false);
                    fetchPreviewController.current = null;
                }
            }
        },
        [], // Removed toast from dependencies as it's not used here
    );

    const fetchInternalLinkPreview = useCallback(async (url: string) => {
        if (fetchInternalPreviewController.current) fetchInternalPreviewController.current.abort();
        const controller = new AbortController();
        fetchInternalPreviewController.current = controller;
        setIsInternalPreviewLoading(true);
        setInternalPreview(null);
        setLinkPreview(null);
        try {
            const result = await getInternalLinkPreviewData(url);
            if (controller.signal.aborted) return;
            if ("error" in result) {
                console.warn("Failed to fetch internal link preview:", result.error);
                setDetectedUrl(url);
                setInternalPreview(null);
            } else {
                setInternalPreview({
                    type: result.type,
                    id: result.type === "circle" ? result.data.handle! : result.data._id.toString(),
                    url: window.location.origin + url,
                    data: result.data,
                });
                setDetectedUrl(url);
            }
        } catch (error: any) {
            if (error.name !== "AbortError") {
                console.error("Error calling getInternalLinkPreviewData:", error);
                setDetectedUrl(url);
                setInternalPreview(null);
            }
        } finally {
            if (fetchInternalPreviewController.current === controller) {
                setIsInternalPreviewLoading(false);
                fetchInternalPreviewController.current = null;
            }
        }
    }, []);

    const debouncedFetchExternalPreview = useMemo(() => {
        const [debounced, cancel] = debounce(fetchExternalLinkPreview, 750);
        cancelExternalFetchRef.current = cancel;
        return debounced;
    }, [fetchExternalLinkPreview]);

    const debouncedFetchInternalPreview = useMemo(() => {
        const [debounced, cancel] = debounce(fetchInternalLinkPreview, 750);
        cancelInternalFetchRef.current = cancel;
        return debounced;
    }, [fetchInternalLinkPreview]);

    useEffect(() => {
        const urlInfo = extractFirstUrl(postContent);
        if (urlInfo) {
            if (urlInfo.url !== detectedUrl || previewRemovedManually) {
                setPreviewRemovedManually(false);
                if (urlInfo.isInternal) {
                    debouncedFetchInternalPreview(urlInfo.url);
                } else {
                    debouncedFetchExternalPreview(urlInfo.url);
                }
            }
        } else if (detectedUrl) {
            removeLinkPreview();
        }
    }, [
        postContent,
        detectedUrl,
        debouncedFetchExternalPreview,
        debouncedFetchInternalPreview,
        previewRemovedManually,
    ]);

    const removeLinkPreview = () => {
        setLinkPreview(null);
        setInternalPreview(null);
        setDetectedUrl(null);
        setIsPreviewLoading(false);
        setIsInternalPreviewLoading(false);
        if (fetchPreviewController.current) fetchPreviewController.current.abort();
        if (fetchInternalPreviewController.current) fetchInternalPreviewController.current.abort();
        cancelExternalFetchRef.current();
        cancelInternalFetchRef.current();
        setPreviewRemovedManually(true);
    };

    const getUserGroupName = (userGroup: string) => {
        const targetCircleForGroups = selectedCircle || user;
        if (!targetCircleForGroups || !targetCircleForGroups.userGroups) {
            return userGroup.charAt(0).toUpperCase() + userGroup.slice(1);
        }
        const group = targetCircleForGroups.userGroups.find((g) => g.handle === userGroup);
        if (!group) {
            return userGroup.charAt(0).toUpperCase() + userGroup.slice(1);
        }
        return group.name;
    };

    const getAvailableUserGroups = () => {
        const targetCircleForGroups = selectedCircle || user;
        if (!targetCircleForGroups || !user || !user.memberships) return ["everyone"];
        const membership = user.memberships.find((m) => m.circleId === targetCircleForGroups._id);
        if (!membership) {
            return ["everyone"];
        }
        const groups = ["everyone"];
        if (membership.userGroups && membership.userGroups.length > 0) {
            membership.userGroups.forEach((group) => {
                if (!groups.includes(group)) {
                    groups.push(group);
                }
            });
        }
        return groups;
    };

    useEffect(() => {
        if (initialPost) {
            // Initial post state already handled by useState initial values
        }
    }, [initialPost]);

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

    const handleSubmit = async () => {
        startTransition(async () => {
            const formData = new FormData();
            if (!title.trim()) {
                toast({
                    title: "Error",
                    description: "Please enter a title for your forum post.",
                    variant: "destructive",
                });
                return;
            }
            const isEditing = Boolean(initialPost);
            const targetCircleId = selectedCircleId || initialPost?.circle?._id || initialSelectedCircleId || null;
            if (!isEditing && !targetCircleId) {
                toast({
                    title: "Error",
                    description: "Please select a circle to create a forum post in.",
                    variant: "destructive",
                });
                return;
            }
            formData.append("title", title.trim());
            formData.append("content", postContent);
            userGroups.forEach((group) => {
                formData.append("userGroups", group);
            });
            images.forEach((image) => {
                if (image.file) {
                    formData.append("media", image.file);
                } else if (image.media) {
                    formData.append(`existingMedia`, JSON.stringify(image.media));
                }
            });
            if (initialPost) {
                formData.append("postId", initialPost._id);
            }
            if (location) {
                formData.append("location", JSON.stringify(location));
            }
            if (linkPreview) {
                formData.append("linkPreviewUrl", linkPreview.url);
                if (linkPreview.title) formData.append("linkPreviewTitle", linkPreview.title);
                if (linkPreview.description) formData.append("linkPreviewDescription", linkPreview.description);
                if (linkPreview.image) formData.append("linkPreviewImageUrl", linkPreview.image);
            } else if (internalPreview) {
                formData.append("internalPreviewType", internalPreview.type);
                formData.append("internalPreviewId", internalPreview.id);
                formData.append("internalPreviewUrl", internalPreview.url);
            }
            if (selectedSdgs.length > 0) {
                const validSdgs = selectedSdgs.filter((s) => s._id).map((s) => s._id);
                if (validSdgs.length > 0) {
                    formData.append("sdgs", JSON.stringify(validSdgs));
                }
            }

            await onSubmit(formData, targetCircleId as string);
        });
    };

    const onSubmit = async (formData: FormData, targetCircleId: string) => {
        setIsSubmitting(true);

        const isEditing = Boolean(initialPost);

        // Always include circleId for media handling when available
        if (targetCircleId) {
            formData.append("circleId", targetCircleId);
        }

        try {
            if (isEditing) {
                // Ensure postId was appended earlier in handleSubmit when initialPost exists
                const response = await updatePostAction(formData);
                if (!response.success) {
                    toast({
                        title: response.message || "Failed to update forum post.",
                        variant: "destructive",
                    });
                    return;
                }
                const circleHandle = selectedCircle?.handle || initialPost?.circle?.handle;
                if (circleHandle) {
                    window.location.href = `/circles/${circleHandle}/discussions/${initialPost!._id}`;
                } else {
                    window.location.reload();
                }
            } else {
                // Creating new forum post
                formData.append("postType", "discussion");
                const response = await createPostAction(formData);

                if (!response.success) {
                    toast({
                        title: response.message || "Failed to create forum post.",
                        variant: "destructive",
                    });
                    return;
                } else {
                    // navigate to the newly created forum post
                    if (response.post?._id) {
                        if (selectedCircle?.handle) {
                            window.location.href = `/circles/${selectedCircle.handle}/discussions/${response.post._id}`;
                        } else {
                            window.location.reload();
                        }
                    } else {
                        if (selectedCircle?.handle) {
                            window.location.href = `/circles/${selectedCircle.handle}/discussions`;
                        } else {
                            window.location.reload();
                        }
                    }
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const onCancel = () => {
        if (selectedCircle) {
            window.location.href = `/circles/${selectedCircle.handle}/discussions`;
        } else {
            window.location.href = `/circles/${moduleHandle}/discussions`;
        }
    };

    if (!user) {
        return null;
    }

    return (
        <div {...getRootProps()} className="flex h-full flex-col">
            <div className="flex flex-grow flex-col overflow-hidden p-4">
                {/* Header section */}
                <div className="mb-[5px] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                        <div>
                            <div className="text-sm font-semibold">{user?.name}</div>
                            <div className="mt-1 flex flex-row items-center justify-start gap-2">
                                {itemDetail && (
                                    <div className="min-w-[150px] flex-shrink">
                                        <CircleSelector
                                            onCircleSelected={handleCircleSelected}
                                            itemType={itemDetail}
                                            initialSelectedCircleId={initialSelectedCircleId}
                                            variant="condensed" // Add variant prop
                                        />
                                    </div>
                                )}
                                {selectedCircle && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto p-1 text-xs hover:bg-gray-100"
                                        onClick={() => setIsUserGroupsDialogOpen(true)}
                                        disabled={!selectedCircleId}
                                    >
                                        <div className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            <span>
                                                {userGroups.includes("everyone")
                                                    ? "Everyone"
                                                    : getUserGroupName(userGroups?.[0])}
                                            </span>
                                            <ChevronDown className="h-3 w-3" />
                                        </div>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Conditional Content Area */}
                {selectedCircleId && (
                    <>
                        <div className="flex-grow overflow-y-auto pr-2">
                            {!user.isVerified && (
                                <div className="formatted mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                                    <div className="flex items-center">
                                        <Info className="mr-2 h-5 w-5 flex-shrink-0" />
                                        <p className="mt-0 pt-0" style={{ paddingTop: 0, marginTop: 0 }}>
                                            Your account is not verified. Forum posts from unverified accounts are not
                                            shown to other users until the account is verified.
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div className="mb-3">
                                <Label className="mb-1 block text-sm font-medium text-gray-600">Title</Label>
                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Enter a clear forum post title..."
                                        className="border-0 p-0 text-2xl font-semibold shadow-none placeholder:text-gray-400 focus-visible:ring-0"
                                    />
                                </div>
                            </div>
                            <Label className="mb-1 block text-sm font-medium text-gray-600">Content</Label>
                            <MentionsInput
                                value={postContent}
                                onChange={(e) => setPostContent(e.target.value)}
                                placeholder="Write your forum post..."
                                className="flex-grow"
                                autoFocus
                                style={postMentionsInputStyle}
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
                            {isPreviewLoading && (
                                <div className="mt-4 flex items-center justify-center rounded-lg border p-4">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-gray-500" />
                                    <span className="text-gray-500">Loading preview...</span>
                                </div>
                            )}
                            {linkPreview && !isPreviewLoading && !internalPreview && (
                                <Card className="relative mt-4 overflow-hidden">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1 z-10 h-6 w-6 rounded-full bg-gray-900/50 text-white hover:bg-gray-700/70 hover:text-white"
                                        onClick={removeLinkPreview}
                                        aria-label="Remove link preview"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <a
                                        href={linkPreview.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                    >
                                        <CardContent className="flex flex-col gap-2 p-0 md:flex-row">
                                            {linkPreview.image && (
                                                <div className="relative h-32 w-full flex-shrink-0 md:h-auto md:w-40">
                                                    <Image
                                                        src={linkPreview.image}
                                                        alt={linkPreview.title || "Link preview image"}
                                                        fill
                                                        className="object-cover"
                                                        sizes="(max-width: 768px) 100vw, 160px"
                                                    />
                                                </div>
                                            )}
                                            <div className="flex flex-col justify-center p-3">
                                                <div className="text-sm font-semibold text-gray-600">
                                                    {new URL(linkPreview.url).hostname}
                                                </div>
                                                <div className="mt-1 line-clamp-2 font-medium">{linkPreview.title}</div>
                                                {linkPreview.description && (
                                                    <div className="mt-1 line-clamp-2 text-sm text-gray-500">
                                                        {linkPreview.description}
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </a>
                                </Card>
                            )}
                            {internalPreview && !isInternalPreviewLoading && !linkPreview && (
                                <Card className="relative mt-4 overflow-hidden">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1 z-10 h-6 w-6 rounded-full bg-gray-900/50 text-white hover:bg-gray-700/70 hover:text-white"
                                        onClick={removeLinkPreview}
                                        aria-label="Remove link preview"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <div className="flex items-center space-x-3 p-3">
                                        {internalPreview.type === "circle" && (
                                            <>
                                                <Avatar className="h-10 w-10 rounded-md">
                                                    <AvatarImage
                                                        src={(internalPreview.data as Circle).picture?.url}
                                                        alt={(internalPreview.data as Circle).name}
                                                    />
                                                    <AvatarFallback>
                                                        <Users className="h-5 w-5" />
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-xs text-gray-500">Circle</div>
                                                    <div className="font-medium">
                                                        {(internalPreview.data as Circle).name}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        {internalPreview.type === "post" && (
                                            <>
                                                <Avatar className="h-10 w-10 rounded-full">
                                                    <AvatarImage
                                                        src={(internalPreview.data as PostDisplay).author?.picture?.url}
                                                        alt={(internalPreview.data as PostDisplay).author?.name}
                                                    />
                                                    <AvatarFallback>
                                                        {(internalPreview.data as PostDisplay).author?.name?.charAt(
                                                            0,
                                                        ) || "?"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-xs text-gray-500">
                                                        Forum post by{" "}
                                                        {(internalPreview.data as PostDisplay).author?.name}
                                                    </div>
                                                    <p className="text-sm text-gray-800">
                                                        {truncateText(
                                                            (internalPreview.data as PostDisplay).content!,
                                                            100,
                                                        )}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                        {internalPreview.type === "proposal" && (
                                            <>
                                                <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                                                    <CircleHelp className="h-5 w-5" />
                                                </Avatar>
                                                <div>
                                                    <div className="text-xs text-gray-500">Proposal</div>
                                                    <div className="font-medium">
                                                        {(internalPreview.data as ProposalDisplay).name}
                                                    </div>
                                                    <p className="text-sm text-gray-600">
                                                        Status:{" "}
                                                        <span className="font-semibold">
                                                            {(internalPreview.data as ProposalDisplay).stage}
                                                        </span>
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                        {internalPreview.type === "issue" && (
                                            <>
                                                <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                                                    <AlertCircle className="h-5 w-5" />
                                                </Avatar>
                                                <div>
                                                    <div className="text-xs text-gray-500">Issue</div>
                                                    <div className="font-medium">
                                                        {(internalPreview.data as IssueDisplay).title}
                                                    </div>
                                                    <p className="text-sm text-gray-600">
                                                        Status:{" "}
                                                        <span className="font-semibold">
                                                            {(internalPreview.data as IssueDisplay).stage}
                                                        </span>
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </Card>
                            )}
                            {images.length > 0 && (
                                <div className="relative mt-4">
                                    <Carousel setApi={setCarouselApi}>
                                        <CarouselContent>
                                            {images.map((image, index) => (
                                                <CarouselItem key={index} className="relative">
                                                    <img
                                                        src={image.preview}
                                                        alt={`Uploaded image ${index + 1}`}
                                                        className="h-48 w-full rounded-lg object-cover"
                                                    />
                                                    <Button
                                                        variant="destructive"
                                                        size="icon"
                                                        className="absolute right-2 top-2 rounded-full"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeImage(index);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </CarouselItem>
                                            ))}
                                        </CarouselContent>
                                        <CarouselPrevious />
                                        <CarouselNext />
                                    </Carousel>
                                    <div className="mt-2 flex justify-center">
                                        {images.map((_, index) => (
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
                            {location && (
                                <div className="mt-4 flex flex-row items-center justify-center rounded-lg bg-gray-100 p-4 pl-3">
                                    <MapPin className={`mr-3 h-5 w-5`} style={{ color: "#c3224d" }} />
                                    {getFullLocationName(location)}
                                </div>
                            )}
                            {showPollCreator && (
                                <div className="mt-4 rounded-lg bg-gray-100 p-4">
                                    <p className="text-sm text-gray-600">📊 Poll creator placeholder</p>
                                </div>
                            )}
                        </div>
                        <div className="mt-auto flex items-center justify-between border-t pt-4">
                            <div className="flex space-x-2">
                                <div>
                                    <input {...getInputProps()} className="hidden" id="image-picker-input" />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-full"
                                        onClick={() => {
                                            document.getElementById("image-picker-input")?.click();
                                        }}
                                    >
                                        <ImageIcon className="h-5 w-5 text-gray-500" />
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full"
                                    onClick={() => setIsLocationDialogOpen(true)}
                                >
                                    <MapPinIcon className="h-5 w-5 text-gray-500" />
                                </Button>
                                <SdgFilter
                                    displayAs="popover"
                                    selectedSdgs={selectedSdgs}
                                    onSelectionChange={setSelectedSdgs}
                                    popoverContentClassName="z-[111]"
                                    gridCols="grid-cols-4"
                                    trigger={
                                        <Button variant="ghost" size="icon" className="rounded-full">
                                            {selectedSdgs.length === 0 ? (
                                                <Image
                                                    src="/images/sdgs/SDG_Wheel_WEB.png"
                                                    alt="SDG Wheel"
                                                    width={20}
                                                    height={20}
                                                />
                                            ) : (
                                                <div className="flex -space-x-2">
                                                    {selectedSdgs.slice(0, 3).map((sdg) => (
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
                                        </Button>
                                    }
                                />
                            </div>
                            <div className="space-x-2">
                                <Button variant="ghost" className="text-gray-500" onClick={onCancel}>
                                    Cancel
                                </Button>
                                <Button
                                    className="rounded-full bg-blue-500 px-6 text-white hover:bg-blue-600"
                                    onClick={handleSubmit}
                                    disabled={isActuallySubmitting || isPreviewLoading || isInternalPreviewLoading}
                                >
                                    {isActuallySubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {initialPost ? "Updating..." : "Creating forum post..."}
                                        </>
                                    ) : (
                                        <>{initialPost ? "Update" : "Create Forum Post"}</>
                                    )}
                                </Button>
                            </div>
                        </div>
                        {dragging && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-200 bg-opacity-50">
                                <p className="text-lg font-semibold text-gray-700">Drop images here</p>
                            </div>
                        )}
                        <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                            <DialogContent
                                className="z-[111]"
                                onInteractOutside={(e) => {
                                    e.preventDefault();
                                }}
                            >
                                <DialogHeader>
                                    <DialogTitle>Select Location</DialogTitle>
                                </DialogHeader>
                                <LocationPicker value={location!} onChange={setLocation} />
                                <div className="mt-4 flex justify-end">
                                    <Button variant="secondary" onClick={() => setIsLocationDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="default"
                                        onClick={() => setIsLocationDialogOpen(false)}
                                        className="ml-2"
                                    >
                                        Set Location
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>{" "}
            {/* Closes "flex flex-grow flex-col overflow-hidden" */}
            {/* UserGroups Dialog is a direct child of the root div */}
            <Dialog open={isUserGroupsDialogOpen} onOpenChange={setIsUserGroupsDialogOpen}>
                <DialogContent
                    className="z-[111] max-w-md"
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl font-bold">
                            Who can see your forum post?
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-2 space-y-4">
                        <div className="text-sm text-gray-600">
                            Your default audience is <span className="font-semibold">Everyone</span> but you can change
                            the audience for this forum post.
                        </div>
                        <div className="max-h-[300px] space-y-3 overflow-y-auto py-2">
                            <div className="flex items-center rounded-lg p-2 hover:bg-gray-100">
                                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                                    <Globe className="h-5 w-5 text-gray-700" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">Everyone</div>
                                    <div className="text-xs text-gray-500">Everyone on and outside Kamooni</div>
                                </div>
                                <div className="ml-2">
                                    <input
                                        type="radio"
                                        id="group-everyone"
                                        name="visibility"
                                        className="h-4 w-4 text-blue-600"
                                        checked={userGroups.includes("everyone")}
                                        onChange={() => setUserGroups(["everyone"])}
                                    />
                                </div>
                            </div>
                            {getAvailableUserGroups()
                                .filter((group) => group !== "everyone")
                                .map((group) => (
                                    <div key={group} className="flex items-center rounded-lg p-2 hover:bg-gray-100">
                                        <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                                            <Users className="h-5 w-5 text-gray-700" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium">{getUserGroupName(group)}</div>
                                            <div className="text-xs text-gray-500">
                                                Only {getUserGroupName(group)?.toLowerCase()} of{" "}
                                                {(selectedCircle || user).name}
                                            </div>
                                        </div>
                                        <div className="ml-2">
                                            <input
                                                type="radio"
                                                id={`group-${group}`}
                                                name="visibility"
                                                className="h-4 w-4 text-blue-600"
                                                checked={userGroups.includes(group) && !userGroups.includes("everyone")}
                                                onChange={() => setUserGroups([group])}
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                    <DialogFooter className="flex justify-between sm:justify-between">
                        <Button variant="ghost" onClick={() => setIsUserGroupsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => setIsUserGroupsDialogOpen(false)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

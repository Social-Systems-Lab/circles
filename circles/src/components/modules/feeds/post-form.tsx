// post-form.tsx
import React, { useState, useCallback, useEffect, useTransition, useRef } from "react"; // Added useRef
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react"; // Added X
import { UserPicture } from "../members/user-picture";
import { Circle, Feed, Location, Media, PostDisplay, UserPrivate } from "@/models/models";
import { CirclePicture } from "../circles/circle-picture";
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
import { useAtom } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";
import { Mention, MentionsInput } from "react-mentions";
import {
    defaultMentionsInputStyle,
    defaultMentionStyle,
    handleMentionQuery,
    renderCircleSuggestion,
} from "./post-list";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { userAtom } from "@/lib/data/atoms";
import { getLinkPreviewAction } from "./actions"; // Import the server action
import { useToast } from "@/components/ui/use-toast"; // Import useToast
import Image from "next/image"; // Import Next Image
import { Card, CardContent } from "@/components/ui/card"; // Import Card components

// Debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Parameters<F>) => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
        timeout = setTimeout(() => func(...args), waitFor);
    };

    return debounced as (...args: Parameters<F>) => ReturnType<F>;
}

// Type for the link preview data structure returned by the action
type LinkPreviewData = {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    mediaType?: string;
    contentType?: string;
    favicons?: string[];
};

const postMentionsInputStyle = {
    control: {
        backgroundColor: "rgb(255 255 255)",
    },
    input: {
        padding: "0 0",
        outline: "none",
        fontSize: "1.125rem",
        lineHeight: "1.75rem",
        paddingTop: "1.5rem",
        overflowWrap: "break-word", // Add word wrapping
        wordBreak: "break-word", // Ensure breaks happen correctly
    },
    highlighter: {
        padding: "0 0", // Same as input
        paddingTop: "1.5rem",
        fontSize: "1.125rem",
        lineHeight: "1.75rem",
        overflowWrap: "break-word", // Add word wrapping
        wordBreak: "break-word", // Ensure breaks happen correctly
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

type ImageItem = {
    file?: File;
    preview: string;
    media?: Media;
};

type PostFormProps = {
    circle: Circle;
    feed: Feed;
    user: UserPrivate;
    initialPost?: PostDisplay;
    onSubmit: (formData: FormData) => Promise<void>;
    onCancel: () => void;
};

export function PostForm({ circle, feed, user, initialPost, onSubmit, onCancel }: PostFormProps) {
    const [postContent, setPostContent] = useState(initialPost?.content || "");
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const [isPending, startTransition] = useTransition();
    const [location, setLocation] = useState<Location | undefined>(initialPost?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);

    // State for circle selection and user groups
    const [selectedCircle, setSelectedCircle] = useState<Circle>(circle);
    const [userGroups, setUserGroups] = useState<string[]>(["everyone"]);
    const [isUserGroupsDialogOpen, setIsUserGroupsDialogOpen] = useState(false);
    const [availableCircles, setAvailableCircles] = useState<Circle[]>([]);
    const { toast } = useToast(); // Initialize toast

    // --- Re-insert Dropzone Logic ---
    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const newImages = acceptedFiles.map((file) => ({
                file,
                preview: URL.createObjectURL(file),
            }));
            setImages((prevImages) => [...prevImages, ...newImages]);
            setDragging(false); // Ensure dragging state is reset

            // Scroll to the end of the carousel after adding images
            setTimeout(() => {
                if (carouselApi) {
                    carouselApi.scrollTo(images.length + newImages.length - 1);
                }
            }, 0);
        },
        [carouselApi, images.length, setImages], // Added setImages dependency
    );

    const removeImage = (index: number) => {
        setImages((prevImages) => {
            const newImages = [...prevImages];
            const removedImage = newImages.splice(index, 1)[0];
            if (removedImage.file) {
                URL.revokeObjectURL(removedImage.preview); // Clean up object URL
            }
            // Adjust carousel scroll after removal if needed
            if (carouselApi) {
                // Small delay to allow state update before scrolling
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
        onDropAccepted: () => setDragging(false), // Ensure reset on drop
        noClick: true, // Prevent default click behavior if using custom button
    });
    // --- End Re-insert Dropzone Logic ---

    // --- Link Preview State ---
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
    const [detectedUrl, setDetectedUrl] = useState<string | null>(initialPost?.linkPreviewUrl || null);
    const fetchPreviewController = useRef<AbortController | null>(null);
    // --- End Link Preview State ---

    // Get all circles the user is a member of
    useEffect(() => {
        if (user && user.memberships) {
            const circles = user.memberships.map((membership) => membership.circle);
            setAvailableCircles(circles);
        }
    }, [user]);

    // --- Link Preview Logic ---
    const extractFirstUrl = (text: string): string | null => {
        // More robust URL regex (handles various protocols, domains, paths, queries, fragments)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = text.match(urlRegex);
        return matches ? matches[0] : null;
    };

    const fetchLinkPreview = useCallback(
        async (url: string) => {
            if (fetchPreviewController.current) {
                fetchPreviewController.current.abort(); // Abort previous request if any
            }
            const controller = new AbortController();
            fetchPreviewController.current = controller;

            setIsPreviewLoading(true);
            setLinkPreview(null); // Clear previous preview

            try {
                const result = await getLinkPreviewAction(url);

                // Check if the request was aborted
                if (controller.signal.aborted) {
                    console.log("Link preview fetch aborted for:", url);
                    return;
                }

                if (result.success && result.preview) {
                    setLinkPreview(result.preview);
                    setDetectedUrl(result.preview.url); // Update detected URL to the final one after redirects
                } else {
                    console.warn("Failed to fetch link preview:", result.error);
                    // Optionally show a toast message on failure
                    // toast({ title: "Link Preview Failed", description: result.error, variant: "destructive" });
                    setDetectedUrl(url); // Keep the originally detected URL so we don't retry immediately
                    setLinkPreview(null); // Ensure preview is cleared on failure
                }
            } catch (error: any) {
                if (error.name !== "AbortError") {
                    console.error("Error calling getLinkPreviewAction:", error);
                    // toast({ title: "Error", description: "Could not fetch link preview.", variant: "destructive" });
                    setDetectedUrl(url);
                    setLinkPreview(null);
                }
            } finally {
                // Only set loading to false if this is the latest request
                if (fetchPreviewController.current === controller) {
                    setIsPreviewLoading(false);
                    fetchPreviewController.current = null;
                }
            }
        },
        [toast],
    ); // Added toast dependency

    const debouncedFetchPreview = useCallback(debounce(fetchLinkPreview, 750), [fetchLinkPreview]);

    useEffect(() => {
        const urlInContent = extractFirstUrl(postContent);

        // Fetch only if a new URL is found and it's different from the currently detected/previewed one
        if (urlInContent && urlInContent !== detectedUrl) {
            debouncedFetchPreview(urlInContent);
        } else if (!urlInContent && detectedUrl) {
            // If URL is removed from text, clear the preview state
            // setDetectedUrl(null); // Keep detectedUrl to avoid re-fetching if user types it back
            // setLinkPreview(null); // Keep preview until explicitly removed or replaced
            // setIsPreviewLoading(false);
            // if (fetchPreviewController.current) {
            //     fetchPreviewController.current.abort();
            //     fetchPreviewController.current = null;
            // }
        }
    }, [postContent, detectedUrl, debouncedFetchPreview]);

    const removeLinkPreview = () => {
        setLinkPreview(null);
        setDetectedUrl(null); // Allow re-detection if URL is added back
        setIsPreviewLoading(false);
        if (fetchPreviewController.current) {
            fetchPreviewController.current.abort();
            fetchPreviewController.current = null;
        }
    };
    // --- End Link Preview Logic ---

    const getUserGroupName = (userGroup: string) => {
        if (!selectedCircle || !selectedCircle.userGroups) {
            // If no circle is selected or it has no user groups, capitalize the first letter of the group name
            return userGroup.charAt(0).toUpperCase() + userGroup.slice(1);
        }

        // Find the user group in the selected circle's user groups
        const group = selectedCircle.userGroups.find((g) => g.handle === userGroup);

        // If the group is not found, capitalize the first letter of the group name
        if (!group) {
            return userGroup.charAt(0).toUpperCase() + userGroup.slice(1);
        }

        return group.name;
    };

    // Get available user groups for the selected circle that the user is a member of
    const getAvailableUserGroups = () => {
        if (!selectedCircle || !user || !user.memberships) return ["everyone"];

        // Find the user's membership for the selected circle
        const membership = user.memberships.find((m) => m.circleId === selectedCircle._id);

        if (!membership) {
            // If user is not a member of this circle, only allow "everyone"
            return ["everyone"];
        }

        // Always include "everyone" as an option
        const groups = ["everyone"];

        // Add the user groups the user is a member of in this circle
        if (membership.userGroups && membership.userGroups.length > 0) {
            membership.userGroups.forEach((group) => {
                if (!groups.includes(group)) {
                    groups.push(group);
                }
            });
        }

        return groups;
    };

    // Handle circle change
    const handleCircleChange = (circleId: string) => {
        const newCircle = availableCircles.find((c) => c._id === circleId);
        if (newCircle) {
            setSelectedCircle(newCircle);

            // Reset user groups to default
            setUserGroups(["everyone"]);
        }
    };

    useEffect(() => {
        if (initialPost) {
            // State setting moved to useState initial values
        }
    }, [initialPost]);

    // Ensure carousel useEffect is present
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
            formData.append("content", postContent);
            formData.append("circleId", selectedCircle._id);
            userGroups.forEach((group) => {
                formData.append("userGroups", group);
            });

            images.forEach((image, index) => {
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

            // --- Append Link Preview Data ---
            if (linkPreview) {
                formData.append("linkPreviewUrl", linkPreview.url);
                if (linkPreview.title) formData.append("linkPreviewTitle", linkPreview.title);
                if (linkPreview.description) formData.append("linkPreviewDescription", linkPreview.description);
                if (linkPreview.image) formData.append("linkPreviewImageUrl", linkPreview.image);
            }
            // --- End Append Link Preview Data ---

            await onSubmit(formData);
        });
    };

    return (
        // Use getRootProps on the main div
        <div {...getRootProps()} className="p-4">
            {/* ... (existing header with user/circle/group selectors) ... */}
            <div className="mb-[5px] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                    <div>
                        <div className="text-sm font-semibold">{user?.name}</div>
                        <div className="flex flex-row items-center justify-center gap-[4px]">
                            <div className="text-xs text-gray-500">Post in</div>

                            {/* Circle selector */}
                            {availableCircles.length > 0 ? (
                                <Select value={selectedCircle._id} onValueChange={handleCircleChange}>
                                    <SelectTrigger className="h-6 w-auto border-0 bg-transparent p-0 pl-1 text-xs hover:bg-gray-100">
                                        <div className="flex items-center gap-1">
                                            <CirclePicture circle={selectedCircle} size="14px" />
                                            <span>{selectedCircle.name}</span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCircles.map((c) => (
                                            <SelectItem key={c._id} value={c._id}>
                                                <div className="flex items-center gap-2">
                                                    <CirclePicture circle={c} size="20px" />
                                                    <span>{c.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="flex items-center gap-1">
                                    <CirclePicture circle={selectedCircle} size="14px" />
                                    <span className="text-xs">{selectedCircle.name}</span>
                                </div>
                            )}

                            {/* User group selector */}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-2 h-6 p-0 pl-1 text-xs hover:bg-gray-100"
                                onClick={() => setIsUserGroupsDialogOpen(true)}
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
                        </div>
                    </div>
                </div>
            </div>

            <MentionsInput
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Share your story..."
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

            {/* --- Link Preview Display --- */}
            {isPreviewLoading && (
                <div className="mt-4 flex items-center justify-center rounded-lg border p-4">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-gray-500" />
                    <span className="text-gray-500">Loading link preview...</span>
                </div>
            )}
            {linkPreview && !isPreviewLoading && (
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
                    <a href={linkPreview.url} target="_blank" rel="noopener noreferrer" className="block">
                        <CardContent className="flex flex-col gap-2 p-0 md:flex-row">
                            {linkPreview.image && (
                                <div className="relative h-32 w-full flex-shrink-0 md:h-auto md:w-40">
                                    <Image
                                        src={linkPreview.image}
                                        alt={linkPreview.title || "Link preview image"}
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 768px) 100vw, 160px" // Basic responsive sizes
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
            {/* --- End Link Preview Display --- */}

            {/* ... (existing image carousel, location display, poll creator placeholder) ... */}
            {/* Ensure removeImage is called correctly in the image carousel */}
            {images.length > 0 && (
                <div className="relative mt-4">
                    <Carousel setApi={setCarouselApi}>
                        <CarouselContent>
                            {images.map((image, index) => (
                                <CarouselItem key={index} className="relative">
                                    {/* eslint-disable-next-line */}
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
                                            // Prevent dropzone activation on button click
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

            {/* ... (existing action buttons, drag overlay, dialogs) ... */}
            <div className="mt-4 flex items-center justify-between">
                <div className="flex space-x-2">
                    <div>
                        {/* Ensure the image input uses getInputProps */}
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
                    {/*
                    TODO - Implement Poll Creator
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        onClick={() => setShowPollCreator(!showPollCreator)}
                    >
                        <BarChartIcon className="h-5 w-5 text-gray-500" />
                    </Button> */}
                </div>
                <div className="space-x-2">
                    <Button variant="ghost" className="text-gray-500" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        className="rounded-full bg-blue-500 px-6 text-white hover:bg-blue-600"
                        onClick={handleSubmit}
                        disabled={isPending || isPreviewLoading} // Disable post button while loading preview
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {initialPost ? "Updating..." : "Posting..."}
                            </>
                        ) : (
                            <>{initialPost ? "Update" : "Post"}</>
                        )}
                    </Button>
                </div>
            </div>
            {dragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-200 bg-opacity-50">
                    <p className="text-lg font-semibold text-gray-700">Drop images here</p>
                </div>
            )}

            {/* Location Dialog */}
            <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Location</DialogTitle>
                    </DialogHeader>
                    <LocationPicker value={location!} onChange={setLocation} />
                    <div className="mt-4 flex justify-end">
                        <Button variant="secondary" onClick={() => setIsLocationDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="default" onClick={() => setIsLocationDialogOpen(false)} className="ml-2">
                            Set Location
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* User Groups Dialog */}
            <Dialog open={isUserGroupsDialogOpen} onOpenChange={setIsUserGroupsDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl font-bold">Who can see your post?</DialogTitle>
                    </DialogHeader>
                    <div className="mt-2 space-y-4">
                        <div className="text-sm text-gray-600">
                            Your post will be visible in feeds, on your profile, and in search results.
                        </div>

                        <div className="text-sm text-gray-600">
                            Your default audience is <span className="font-semibold">Everyone</span> but you can change
                            the audience for this post.
                        </div>

                        <div className="max-h-[300px] space-y-3 overflow-y-auto py-2">
                            {/* Everyone option */}
                            <div className="flex items-center rounded-lg p-2 hover:bg-gray-100">
                                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                                    <Globe className="h-5 w-5 text-gray-700" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">Everyone</div>
                                    <div className="text-xs text-gray-500">Everyone on and outside MakeCircles</div>
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

                            {/* Other user groups */}
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
                                                Only {getUserGroupName(group)?.toLowerCase()} of {selectedCircle.name}
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

                        {/* <div className="flex items-center space-x-2 pt-2">
                            <Checkbox id="set-as-default" />
                            <Label htmlFor="set-as-default" className="text-sm">
                                Set as default audience
                            </Label>
                        </div> */}
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

"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, MapPinIcon, BarChartIcon, Trash2, Loader2 } from "lucide-react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { UserPicture } from "../members/user-picture";
import { Circle, Feed } from "@/models/models";
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
import { createPostAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { useIsCompact } from "@/components/utils/use-is-compact";

type CreateNewPostProps = {
    circle: Circle;
    feed: Feed;
};

export function CreateNewPost({ circle, feed }: CreateNewPostProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [postContent, setPostContent] = useState("");
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [user] = useAtom(userAtom);
    const [images, setImages] = useState<any[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const isCompact = useIsCompact();

    // Handle image drop
    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const newImages = acceptedFiles.map((file) => ({
                file,
                preview: URL.createObjectURL(file), // Keep blob URL for preview
            }));
            setImages((prevImages) => [...prevImages, ...newImages]);

            setTimeout(() => {
                if (carouselApi) {
                    carouselApi.scrollTo(images.length);
                }
            }, 0);
        },
        [carouselApi, images.length],
    );

    // Handle removing an image
    const removeImage = (index: number) => {
        setImages((prevImages) => prevImages.filter((_, i) => i !== index));
    };

    // Dropzone config (drag-and-drop)
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
        onDragEnter: () => setDragging(true),
        onDragLeave: () => setDragging(false),
        onDropAccepted: () => setDragging(false),
        noClick: true, // Prevent dropzone from opening file picker on click
    });

    // Update current image index in carousel when slide changes
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

    const handlePost = () => {
        console.log("Posting:", { content: postContent, images });

        startTransition(async () => {
            const formData = new FormData();
            formData.append("content", postContent);
            formData.append("circleId", circle._id);
            formData.append("feedId", feed._id);
            // append images to form
            images.forEach(({ file }) => {
                formData.append("media", file);
            });

            const response = await createPostAction(formData, circle.circleType === "user");
            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            } else {
                toast({
                    title: "Post created successfully",
                    variant: "success",
                });
            }

            setPostContent("");
            setImages([]);
            setIsOpen(false);
            setShowLocationPicker(false);
            setShowPollCreator(false);
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <div
                    className={`mb-6 flex flex-1 cursor-pointer items-center space-x-4  ${isCompact ? "" : "rounded-[15px] border-0 shadow-lg"}  bg-white p-4`}
                >
                    <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                    <div className="flex-grow">
                        <input
                            disabled={!user}
                            type="text"
                            placeholder={user ? "Share your story" : "Log in to post"}
                            className="w-full rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={() => {
                                if (user) setIsOpen(true);
                            }}
                            readOnly
                        />
                    </div>
                </div>
            </DialogTrigger>

            {/* Dialog content with dropzone */}
            <DialogContent
                {...getRootProps()}
                className="overflow-hidden rounded-[15px] p-0 sm:max-w-[425px] sm:rounded-[15px]"
            >
                <div className="bg-white shadow-lg">
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-2">
                            <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                            <div>
                                <div className="text-sm font-semibold">{user?.name}</div>
                                <div className="flex flex-row items-center justify-center gap-[4px]">
                                    <div className="text-xs text-gray-500">Post in</div>
                                    <CirclePicture name={circle?.name} picture={circle?.picture?.url} size="14px" />
                                    <div className="text-xs text-gray-500">{circle?.name}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <Textarea
                            placeholder="Share your story"
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            className="min-h-[150px] w-full resize-none border-0 text-lg focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0"
                        />
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
                                                    onClick={() => removeImage(index)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </CarouselItem>
                                        ))}
                                    </CarouselContent>
                                    <CarouselPrevious />
                                    <CarouselNext />
                                </Carousel>

                                {/* Dot Indicator */}
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
                        {showLocationPicker && (
                            <div className="mt-4 rounded-lg bg-gray-100 p-4">
                                <p className="text-sm text-gray-600">📍 Location picker placeholder</p>
                            </div>
                        )}
                        {showPollCreator && (
                            <div className="mt-4 rounded-lg bg-gray-100 p-4">
                                <p className="text-sm text-gray-600">📊 Poll creator placeholder</p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-between p-4">
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
                                onClick={() => setShowLocationPicker(!showLocationPicker)}
                            >
                                <MapPinIcon className="h-5 w-5 text-gray-500" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full"
                                onClick={() => setShowPollCreator(!showPollCreator)}
                            >
                                <BarChartIcon className="h-5 w-5 text-gray-500" />
                            </Button>
                        </div>
                        <div className="space-x-2">
                            <Button variant="ghost" className="text-gray-500" onClick={() => setIsOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="rounded-full bg-blue-500 px-6 text-white hover:bg-blue-600"
                                onClick={handlePost}
                                disabled={isPending}
                            >
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Posting...
                                    </>
                                ) : (
                                    <>Post</>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Dragging overlay */}
                {dragging && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-200 bg-opacity-50">
                        <p className="text-lg font-semibold text-gray-700">Drop images here</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

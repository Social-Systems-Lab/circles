import React, { useState, useCallback, useEffect, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, MapPinIcon, BarChartIcon, Trash2, Loader2 } from "lucide-react";
import { UserPicture } from "../members/user-picture";
import { Circle, Feed, Location, Media, Page, PostDisplay } from "@/models/models";
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

type ImageItem = {
    file?: File;
    preview: string;
    media?: Media;
};

type PostFormProps = {
    circle: Circle;
    feed: Feed;
    user: any;
    initialPost?: PostDisplay;
    onSubmit: (formData: FormData) => Promise<void>;
    onCancel: () => void;
};

export function PostForm({ circle, feed, user, initialPost, onSubmit, onCancel }: PostFormProps) {
    const [postContent, setPostContent] = useState(initialPost?.content || "");
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const [isPending, startTransition] = useTransition();
    const [location, setLocation] = useState<Location | undefined>(initialPost?.location);

    useEffect(() => {
        if (initialPost) {
            setPostContent(initialPost.content);
            const existingImages =
                initialPost.media?.map((m) => ({
                    preview: m.fileInfo.url,
                    media: m,
                })) || [];
            setImages(existingImages);
        }
    }, [initialPost]);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const newImages = acceptedFiles.map((file) => ({
                file,
                preview: URL.createObjectURL(file),
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

    const removeImage = (index: number) => {
        setImages((prevImages) => {
            const newImages = [...prevImages];
            const removedImage = newImages.splice(index, 1)[0];
            if (removedImage.file) {
                URL.revokeObjectURL(removedImage.preview);
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
            formData.append("circleId", circle._id);
            formData.append("feedId", feed._id);
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
            await onSubmit(formData);
        });
    };

    return (
        <div {...getRootProps()} className="bg-white p-4">
            <div className="flex items-center justify-between">
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
                    <LocationPicker value={location!} onChange={setLocation} />
                </div>
            )}
            {showPollCreator && (
                <div className="mt-4 rounded-lg bg-gray-100 p-4">
                    <p className="text-sm text-gray-600">📊 Poll creator placeholder</p>
                </div>
            )}
            <div className="mt-4 flex items-center justify-between">
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
                        disabled={isPending}
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
        </div>
    );
}

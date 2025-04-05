"use client";

import React, { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { Circle, Media } from "@/models/models"; // Added Media
import EditableImage from "./editable-image"; // Keep for profile picture potentially
import { useIsMobile } from "@/components/utils/use-is-mobile";
import GalleryTrigger from "./gallery-trigger";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import MultiImageUploader
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { saveAbout } from "@/app/circles/[handle]/settings/about/actions"; // Import save action
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

type HomeContentProps = {
    circle: Circle;
    authorizedToEdit: boolean;
};

export default function HomeCover({ circle, authorizedToEdit }: HomeContentProps) {
    const isMobile = useIsMobile();
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [images, setImages] = useState<ImageItem[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Initialize state when circle data is available or changes
    useEffect(() => {
        const initialItems =
            circle.images?.map(
                (media): ImageItem => ({
                    id: media.fileInfo.url,
                    preview: media.fileInfo.url,
                    existingMediaUrl: media.fileInfo.url,
                }),
            ) || [];
        setImages(initialItems);
        setHasChanges(false); // Reset changes on initial load or circle change
    }, [circle.images, circle._id]);

    const handleImageChange = (newImageItems: ImageItem[]) => {
        setImages(newImageItems);
        // Simple check: compare lengths or stringified versions to detect changes
        const initialUrls = circle.images?.map((m) => m.fileInfo.url).sort() || [];
        const currentUrls = newImageItems.map((item) => item.existingMediaUrl || item.preview).sort(); // Use preview for new files
        setHasChanges(JSON.stringify(initialUrls) !== JSON.stringify(currentUrls));
    };

    const handleSaveChanges = () => {
        if (!circle._id) return;
        startTransition(async () => {
            const result = await saveAbout({ _id: circle._id, images: images });
            if (result.success) {
                toast({ title: "Success", description: "Images updated successfully." });
                setHasChanges(false);
                router.refresh(); // Refresh data
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to save images.",
                    variant: "destructive",
                });
            }
        });
    };

    const displayImage = images[0]?.preview ?? circle.images?.[0]?.fileInfo?.url ?? "/images/default-cover.png";
    const galleryImages: Media[] = images.map((item) => ({
        name: item.file?.name || "Cover Image",
        type: item.file?.type || "image/jpeg",
        fileInfo: { url: item.preview }, // Use preview URL for gallery
    }));

    return (
        <>
            <div className="relative">
                <div
                    className={
                        isMobile
                            ? "relative h-[270px] w-full overflow-hidden"
                            : "relative h-[350px] w-full overflow-hidden"
                    }
                >
                    {authorizedToEdit ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                            {hasChanges && (
                                <Button onClick={handleSaveChanges} disabled={isPending} size="sm" className="mt-4">
                                    {isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                                        </>
                                    ) : (
                                        "Save Image Changes"
                                    )}
                                </Button>
                            )}
                        </div>
                    ) : null}

                    {/* Display the first image */}
                    <Image
                        src={displayImage}
                        alt="Cover"
                        className="object-cover"
                        style={{ objectFit: "cover" }}
                        sizes="100vw"
                        fill
                        priority // Prioritize loading the main cover image
                    />

                    {/* Gallery Trigger - Needs update */}
                    {!authorizedToEdit && galleryImages.length > 0 && (
                        <div className="absolute top-0 h-full w-full">
                            {/* TODO: Update GalleryTrigger to accept Media[] */}
                            <GalleryTrigger name="Cover Image" images={galleryImages} />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

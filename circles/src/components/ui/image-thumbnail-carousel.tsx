"use client";

import React, { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Media } from "@/models/models";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAtom } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";
// Removed Autoplay import as it's not installed/needed for now

interface ImageThumbnailCarouselProps {
    images: Media[];
    className?: string;
}

const ImageThumbnailCarousel: React.FC<ImageThumbnailCarouselProps> = ({ images, className }) => {
    const [emblaRef] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        slidesToScroll: "auto", // Scroll naturally based on drag
        loop: images.length > 3, // Loop only if enough images to make sense
    });
    const [, setImageGallery] = useAtom(imageGalleryAtom);

    const handleThumbnailClick = useCallback(
        (index: number) => {
            setImageGallery({ images, initialIndex: index });
        },
        [images, setImageGallery],
    );

    if (!images || images.length === 0) {
        return null;
    }

    return (
        <div className={cn("embla overflow-hidden", className)} ref={emblaRef}>
            <div className="embla__container flex cursor-grab active:cursor-grabbing">
                {images.map((image, index) => (
                    <div
                        key={image.fileInfo?.url || index} // Use URL or index as key, removed cid access
                        // Adjust flex basis for how many images to show (e.g., 1/3 for 3, 1/4 for 4)
                        // Using min-w-0 is important for flex items that might shrink
                        className="embla__slide relative mr-2 min-w-0 flex-[0_0_30%] md:flex-[0_0_20%]"
                        onClick={() => handleThumbnailClick(index)}
                    >
                        <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                            <Image
                                src={image.fileInfo?.url ?? "/images/default-post-picture.png"}
                                alt={image.name || `Proposal image ${index + 1}`}
                                fill
                                className="cursor-pointer object-cover transition-transform duration-200 ease-in-out hover:scale-105"
                                sizes="(max-width: 768px) 30vw, 20vw" // Optimize image loading
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ImageThumbnailCarousel;

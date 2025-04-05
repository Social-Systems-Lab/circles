"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { type EmblaOptionsType } from "embla-carousel"; // Import type from core library
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Media } from "@/models/models";
import { useAtom } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";

type PropType = {
    images: Media[];
    options?: any; // Remove explicit EmblaOptionsType, let TS infer or use any
    containerClassName?: string;
    imageClassName?: string;
    showArrows?: boolean; // New prop
    showDots?: boolean; // New prop
    dotsPosition?: "bottom-center" | "bottom-right"; // New prop
    disableSwipe?: boolean;
};

const ImageCarousel: React.FC<PropType> = ({
    images,
    options,
    containerClassName,
    imageClassName,
    showArrows = false, // Default to true
    showDots = true, // Default to false
    dotsPosition = "bottom-right", // Default position
    disableSwipe = false,
}) => {
    const [, setImageGallery] = useAtom(imageGalleryAtom);
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        loop: true,
        watchDrag: !disableSwipe,
        ...options, // Allow overriding defaults
    });
    const [prevBtnDisabled, setPrevBtnDisabled] = React.useState(true);
    const [nextBtnDisabled, setNextBtnDisabled] = React.useState(true);
    const [selectedIndex, setSelectedIndex] = React.useState(0); // State for dot indicators

    const handleImageClick = (index: number) => {
        if (images && images.length > 0) {
            setImageGallery({ images: images, initialIndex: index });
        }
    };

    const scrollPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
    const scrollTo = React.useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

    const onSelect = React.useCallback(() => {
        if (!emblaApi) return;
        setSelectedIndex(emblaApi.selectedScrollSnap());
        setPrevBtnDisabled(!emblaApi.canScrollPrev());
        setNextBtnDisabled(!emblaApi.canScrollNext());
    }, [emblaApi]);

    React.useEffect(() => {
        if (!emblaApi) return;
        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);
        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi, onSelect]);

    // Handle cases with no images
    if (!images || images.length === 0) {
        return (
            <div className={cn("relative h-full w-full", containerClassName)}>
                <img
                    src="/images/default-cover.png"
                    alt="Default image"
                    className={cn("h-full w-full object-cover", imageClassName)}
                />
            </div>
        );
    }

    // If only one image, display it directly without carousel controls but with click handler
    if (images.length === 1) {
        const media = images[0];
        return (
            <div
                className={cn("relative h-full w-full cursor-pointer", containerClassName)}
                onClick={() => handleImageClick(0)}
            >
                <img
                    src={media.fileInfo.url}
                    alt={media.name || "Image"}
                    className={cn("h-full w-full object-cover", imageClassName)}
                />
            </div>
        );
    }

    // Render carousel for multiple images using useEmblaCarousel hook and standard img
    return (
        <div
            className={cn(
                "embla relative h-full w-full overflow-hidden",
                containerClassName,
                disableSwipe ? "pointer-events-none" : "",
            )}
            ref={emblaRef}
        >
            <div className="embla__container flex h-full">
                {images.map((media, index) => (
                    <div
                        className="embla__slide relative min-w-0 flex-[0_0_100%]" // Basic Embla slide structure
                        key={media.fileInfo.url || index}
                    >
                        <img
                            src={media.fileInfo.url}
                            alt={media.name || `Image ${index + 1}`}
                            className={cn("h-full w-full cursor-pointer object-cover", imageClassName)} // Fill height/width, object-cover
                            onClick={() => handleImageClick(index)} // Add click handler
                        />
                    </div>
                ))}
            </div>

            {/* Navigation Arrows */}
            {showArrows && (
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 top-1/2 z-10 h-8 w-8 -translate-y-1/2 transform rounded-full border-none bg-black/30 text-white hover:bg-black/50 disabled:opacity-30"
                        onClick={scrollPrev}
                        disabled={prevBtnDisabled}
                    >
                        <ChevronLeft className="h-5 w-5" />
                        <span className="sr-only">Previous slide</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 z-10 h-8 w-8 -translate-y-1/2 transform rounded-full border-none bg-black/30 text-white hover:bg-black/50 disabled:opacity-30"
                        onClick={scrollNext}
                        disabled={nextBtnDisabled}
                    >
                        <ChevronRight className="h-5 w-5" />
                        <span className="sr-only">Next slide</span>
                    </Button>
                </>
            )}

            {/* Dot Indicators */}
            {showDots && images.length > 1 && (
                <div
                    className={cn(
                        "pointer-events-auto absolute bottom-2 left-0 right-0 z-10 flex items-center",
                        dotsPosition === "bottom-center" ? "justify-center" : "justify-end pr-4", // Position based on prop
                    )}
                >
                    <div className="flex space-x-2 rounded-full bg-black/30 p-1">
                        {images.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => scrollTo(index)}
                                className={cn(
                                    "h-2 w-2 rounded-full transition-colors duration-200",
                                    index === selectedIndex ? "bg-white" : "bg-white/40 hover:bg-white/60",
                                )}
                                aria-label={`Go to slide ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageCarousel;

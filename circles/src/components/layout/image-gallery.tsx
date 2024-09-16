"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { X, Maximize, Minimize, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentPreviewAtom, imageGalleryAtom } from "@/lib/data/atoms";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import useEmblaCarousel from "embla-carousel-react";

export const ImageGallery: React.FC = () => {
    const [imageGallery, setImageGallery] = useAtom(imageGalleryAtom);
    const [contentPreview] = useAtom(contentPreviewAtom);
    const [isFullScreen, setIsFullScreen] = useState<boolean | undefined>(undefined);
    const isMobile = useIsMobile();
    const galleryRef = useRef<HTMLDivElement>(null);

    const [emblaRef, emblaApi] = useEmblaCarousel({
        startIndex: imageGallery?.initialIndex || 0,
        align: "center",
        loop: false,
    });
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);

    const showFullScreen = useMemo(() => {
        if (isFullScreen === undefined) {
            return !contentPreview;
        } else {
            return isFullScreen || !contentPreview;
        }
    }, [contentPreview, isFullScreen]);

    const closeGallery = () => {
        setImageGallery(null);
        setIsFullScreen(undefined);
    };

    const toggleFullScreen = () => {
        if (!isMobile) {
            setIsFullScreen(!isFullScreen);
        }
    };

    const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

    const onSelect = useCallback(() => {
        if (!emblaApi) return;
        setCanScrollPrev(emblaApi.canScrollPrev());
        setCanScrollNext(emblaApi.canScrollNext());
    }, [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;
        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);
        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi, onSelect]);

    useEffect(() => {
        if (!imageGallery) return;

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeGallery();
            }
        };
        window.addEventListener("keydown", handleEsc);
        return () => {
            window.removeEventListener("keydown", handleEsc);
        };
    }, [imageGallery]);

    useEffect(() => {
        if (!imageGallery) return;

        const updateSize = () => {
            console.log("updateSize", showFullScreen);
            if (galleryRef.current) {
                let width = window.innerWidth;
                if (typeof document !== "undefined") {
                    width = document.documentElement.offsetWidth;
                }
                const height = window.innerHeight;
                if (showFullScreen || isMobile) {
                    galleryRef.current.style.width = `${width}px`;
                    galleryRef.current.style.height = `${height}px`;
                } else {
                    galleryRef.current.style.width = `${width - 430}px`;
                    galleryRef.current.style.height = `${height}px`;
                }
            }
        };

        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, [showFullScreen, isMobile, imageGallery]);

    if (!imageGallery) return null;

    const { images } = imageGallery;

    return (
        <AnimatePresence>
            <motion.div
                ref={galleryRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 z-[200] flex items-center justify-start bg-black`}
            >
                <div className="embla h-full w-full" ref={emblaRef}>
                    <div className="embla__container h-full">
                        {images.map((image, index) => (
                            <div key={index} className="embla__slide flex h-full items-center justify-center">
                                <img
                                    src={image.fileInfo.url}
                                    alt={image.name || `Image ${index + 1}`}
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {images.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black bg-opacity-50 text-white transition-all hover:bg-opacity-75"
                            onClick={scrollPrev}
                            disabled={!canScrollPrev}
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black bg-opacity-50 text-white transition-all hover:bg-opacity-75"
                            onClick={scrollNext}
                            disabled={!canScrollNext}
                        >
                            <ChevronRight className="h-6 w-6" />
                        </Button>
                    </>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 top-4 rounded-full bg-black bg-opacity-50 text-white transition-all hover:bg-opacity-75"
                    onClick={closeGallery}
                >
                    <X className="h-6 w-6" />
                </Button>
                {!isMobile && contentPreview && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-4 top-4 rounded-full bg-black bg-opacity-50 text-white transition-all hover:bg-opacity-75"
                        onClick={toggleFullScreen}
                    >
                        {showFullScreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
                    </Button>
                )}
            </motion.div>
        </AnimatePresence>
    );
};

export default ImageGallery;

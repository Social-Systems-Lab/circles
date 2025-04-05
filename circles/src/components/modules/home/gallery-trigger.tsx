"use client";

import React from "react";
import { useAtom } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";
import { FileInfo, Media } from "@/models/models";

type GalleryTriggerProps = {
    name: string; // Still useful for context, e.g., "Cover Images"
    images?: Media[]; // Changed to accept an array of Media objects
    initialIndex?: number; // Optional index to start the gallery at
};

export const GalleryTrigger = ({ name, images, initialIndex = 0 }: GalleryTriggerProps) => {
    const [, setImageGallery] = useAtom(imageGalleryAtom);

    const handleImageClick = () => {
        // Check if images array is valid and has items
        if (!images || images.length === 0) return;

        // Set the gallery state with the full array and the starting index
        setImageGallery({ images: images, initialIndex: initialIndex });
    };

    // Only render the trigger if there are images to show
    if (!images || images.length === 0) {
        return null;
    }

    return <div className="h-full w-full cursor-pointer" onClick={handleImageClick}></div>;
};

export default GalleryTrigger;

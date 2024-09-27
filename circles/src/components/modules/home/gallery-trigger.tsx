"use client";

import React from "react";
import { useAtom } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";
import { FileInfo, Media } from "@/models/models";

type GalleryTriggerProps = {
    name: string;
    image?: FileInfo;
};

export const GalleryTrigger = ({ name, image }: GalleryTriggerProps) => {
    const [, setImageGallery] = useAtom(imageGalleryAtom);

    const handleImageClick = () => {
        if (!image?.url) return;
        let media: Media = {
            name: name,
            type: "image",
            fileInfo: image,
        };
        setImageGallery({ images: [media], initialIndex: 0 });
    };

    return <div className="h-full w-full" onClick={() => handleImageClick()}></div>;
};

export default GalleryTrigger;

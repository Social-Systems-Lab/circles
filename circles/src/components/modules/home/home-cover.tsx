"use client";

import React from "react";
import Image from "next/image"; // Keep Image import if needed elsewhere, or remove if unused after changes
import { Circle, Media } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import ImageCarousel from "@/components/ui/image-carousel"; // Import the new carousel component

type HomeContentProps = {
    circle: Circle;
};

// Remove authorizedToEdit from props destructuring
export default function HomeCover({ circle }: HomeContentProps) {
    const isMobile = useIsMobile();

    // Prepare images for the carousel, providing a default if none exist
    const carouselImages: Media[] =
        circle.images && circle.images.length > 0
            ? circle.images
            : [
                  {
                      name: "Default Cover",
                      type: "image/png",
                      fileInfo: { url: "/images/default-cover.png" },
                  },
              ];

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
                    {/* Replace static image and old trigger with the ImageCarousel */}
                    <ImageCarousel
                        images={carouselImages}
                        options={{ loop: carouselImages.length > 1 }} // Enable loop only if multiple images
                        containerClassName="h-full" // Ensure carousel container fills the height
                        imageClassName="object-cover" // Ensure images cover the slide area
                    />
                </div>
            </div>
        </>
    );
}

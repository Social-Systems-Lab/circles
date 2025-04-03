"use client";

import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import EditableImage from "./editable-image";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import GalleryTrigger from "./gallery-trigger";

type HomeContentProps = {
    circle: Circle;
    authorizedToEdit: boolean;
};

export default function HomeCover({ circle, authorizedToEdit }: HomeContentProps) {
    const isMobile = useIsMobile();
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
                        <EditableImage
                            id="cover"
                            src={circle?.cover?.url ?? "/images/default-cover.png"}
                            alt="Cover"
                            className="object-cover"
                            fill
                            circleId={circle._id!}
                        />
                    ) : (
                        <>
                            <Image
                                src={circle?.cover?.url ?? "/images/default-cover.png"}
                                alt="Cover"
                                className=""
                                style={{
                                    objectFit: "cover",
                                }}
                                sizes="100vw"
                                fill
                            />
                            <div className="absolute top-0 h-full w-full">
                                <GalleryTrigger name="Cover Image" image={circle.cover} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

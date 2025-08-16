"use client";

import { contentPreviewAtom, zoomContentAtom } from "@/lib/data/atoms";
import { Content, WithMetric } from "@/models/models";
import { useAtom } from "jotai";
import React, { useEffect } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import Indicators from "../utils/indicators";
import Image from "next/image";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import ImageCarousel from "../ui/image-carousel";
import { Media } from "@/models/models";

interface MapMarkerProps {
    content?: Content;
    onClick?: (content: Content) => void;
    onMapPinClick?: (content: Content) => void;
}

const MapMarker: React.FC<MapMarkerProps> = ({ content, onClick, onMapPinClick }) => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.MapMarker.1");
        }
    }, []);

    const handleClick = () => {
        if (!content) return;

        if (onClick) {
            onClick(content);
        }
    };

    // Compute popover helpers
    const metrics = (content as WithMetric<Content>)?.metrics;
    const title = content?.circleType === "post" ? (content as any)?.content : (content as any)?.name;
    const description = (content as any)?.mission || (content as any)?.description;
    const images: Media[] = (() => {
        const anyContent: any = content;
        let imgs: Media[] = [];
        if (anyContent?.images?.length) {
            imgs = anyContent.images as Media[];
        } else if (anyContent?.media?.length) {
            imgs = anyContent.media as Media[];
        } else if (anyContent?.cover?.url) {
            imgs = [{ name: "cover", type: "image", fileInfo: anyContent.cover } as Media];
        } else if (anyContent?.picture?.url) {
            imgs = [{ name: "picture", type: "image", fileInfo: anyContent.picture } as Media];
        }
        const fallbackUrl =
            (content as any)?.circleType === "post"
                ? "/images/default-post-picture.png"
                : "/images/default-user-cover.png";
        return imgs.length
            ? imgs
            : [{ name: "default", type: "image", fileInfo: { url: fallbackUrl } as any } as Media];
    })();

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div className="group relative cursor-pointer" onClick={handleClick}>
                    <div className="absolute bottom-[4px] left-1/2 -translate-x-1/2 transform">
                        <div
                            className="relative h-10 w-10 rounded-full transition-transform duration-300 group-hover:scale-110"
                            style={
                                metrics?.similarity !== undefined
                                    ? {
                                          background: `conic-gradient(#ac22c3 ${Math.round(
                                              (metrics?.similarity ?? 0) * 360,
                                          )}deg, rgba(172, 34, 195, 0.15) 0deg)`,
                                      }
                                    : undefined
                            }
                        >
                            <div className="absolute inset-[2px] rounded-full bg-white shadow-md" />
                            {content?.circleType === "post" ? (
                                <div className="absolute inset-[2px] flex items-center justify-center rounded-full">
                                    <Image
                                        className="h-9 w-9 rounded-full border bg-cover bg-center"
                                        src="/images/default-post-picture.png"
                                        alt="Post"
                                        width={36}
                                        height={36}
                                        style={{
                                            borderColor:
                                                contentPreview && contentPreview.content?._id === content?._id
                                                    ? "#f8dd53"
                                                    : "#ffffff",
                                        }}
                                    />
                                </div>
                            ) : (
                                <div
                                    className="absolute inset-[2px] rounded-full border bg-white bg-cover bg-center"
                                    style={{
                                        backgroundImage: content?.picture?.url
                                            ? `url(${content?.picture?.url})`
                                            : "none",
                                        borderColor:
                                            contentPreview && contentPreview.content?._id === content?._id
                                                ? "#f8dd53"
                                                : "#ffffff",
                                    }}
                                />
                            )}
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 transform rounded-full bg-white shadow-md" />
                </div>
            </HoverCardTrigger>
            <HoverCardContent
                className="w-auto cursor-pointer rounded-[15px] border-0 bg-transparent p-0"
                onClick={handleClick}
            >
                <HoverCardArrow className="opacity-0" fill="transparent" color="transparent" />
                <div className="relative h-[200px] w-[320px] overflow-hidden rounded-[15px]">
                    <ImageCarousel
                        images={images}
                        containerClassName="h-[200px] w-[320px]"
                        imageClassName="h-full w-full object-cover"
                        showArrows={true}
                        showDots={true}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    {(content as WithMetric<Content>)?.metrics && (
                        <div className="absolute left-2 top-2 z-10">
                            <Indicators
                                metrics={(content as WithMetric<Content>).metrics!}
                                className="bg-transparent pl-0 shadow-none"
                                color="#ffffff"
                                content={content}
                                disableProximity
                            />
                        </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 z-10 p-3">
                        <p className="mb-1 line-clamp-1 text-[14px] font-semibold text-white">{title}</p>
                        {description && <p className="line-clamp-2 text-[12px] text-white/90">{description}</p>}
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};

export default MapMarker;

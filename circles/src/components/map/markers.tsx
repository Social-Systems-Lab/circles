"use client";

import { contentPreviewAtom, zoomContentAtom } from "@/lib/data/atoms";
import { Content, ContentPreviewData, WithMetric } from "@/models/models";
import { useAtom, useSetAtom } from "jotai";
import React, { useEffect } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import Indicators from "../utils/indicators";
import Image from "next/image";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { Footprints, Bike, Car } from "lucide-react";

interface MapMarkerProps {
    content?: Content;
    onClick?: (content: Content) => void;
    onMapPinClick?: (content: Content) => void;
}

const MapMarker: React.FC<MapMarkerProps> = ({ content, onClick, onMapPinClick }) => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [zoomContent, setZoomContent] = useAtom(zoomContentAtom);

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

    const handleMapPinClick = () => {
        if (onMapPinClick && content) {
            onMapPinClick(content);
            return;
        }

        // If no explicit handler provided, set zoomContent to zoom in on map
        if (content) {
            setZoomContent(content);
        }
    };

    // Compute popover helpers
    const metrics = (content as WithMetric<Content>)?.metrics;
    const distance = metrics?.distance;
    const travelMode = distance === undefined ? null : distance < 1.5 ? "walk" : distance < 7 ? "bike" : "car";
    const description = (content as any)?.mission || (content as any)?.description;

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
                className="w-auto cursor-pointer rounded-[15px] border-0 bg-[#333333] p-2 pr-4 pt-[6px]"
                onClick={handleClick}
            >
                <HoverCardArrow className="text-[#333333]" fill="#333333" color="#333333" />
                <div className="flex items-center space-x-2">
                    {content?.circleType === "post" ? (
                        <Image
                            className={`h-9 w-9 rounded-full border-2 bg-white ${contentPreview && contentPreview.content?._id === content?._id ? "border-[#f8dd53]" : "border-white"} bg-cover bg-center shadow-md transition-transform duration-300 group-hover:scale-110`}
                            src="/images/default-post-picture.png"
                            alt="Post"
                            width={36}
                            height={36}
                        />
                    ) : (
                        <div
                            className={`h-9 w-9 rounded-full bg-white bg-cover bg-center shadow-md`}
                            style={{
                                backgroundImage: content?.picture?.url ? `url(${content?.picture?.url})` : "none",
                            }}
                        />
                    )}
                    <div className="max-w-[300px]">
                        {content?.circleType === "post" ? (
                            <p className="line-clamp-2 text-[14px] text-white">{content?.content}</p>
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <p className="text-[14px] font-semibold text-white">{content?.name}</p>
                                    {travelMode && (
                                        <span className="ml-auto flex items-center text-white/80">
                                            {travelMode === "walk" && (
                                                <Footprints className="h-4 w-4" aria-label="Walking distance" />
                                            )}
                                            {travelMode === "bike" && (
                                                <Bike className="h-4 w-4" aria-label="Biking distance" />
                                            )}
                                            {travelMode === "car" && (
                                                <Car className="h-4 w-4" aria-label="Driving distance" />
                                            )}
                                        </span>
                                    )}
                                </div>
                                {description && (
                                    <p className="mt-0.5 line-clamp-2 text-[12px] text-white/80">{description}</p>
                                )}
                            </>
                        )}
                        <div className="flex flex-row">
                            {(content as WithMetric<Content>)?.metrics && (
                                <Indicators
                                    metrics={(content as WithMetric<Content>).metrics!}
                                    className="mr-auto bg-transparent pl-0 shadow-none"
                                    color="#ffffff"
                                    content={content}
                                    onMapPinClick={handleMapPinClick}
                                    disableProximity
                                />
                            )}
                        </div>
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};

export default MapMarker;

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
        }
    };

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div className="group relative cursor-pointer" onClick={handleClick}>
                    <div className="absolute bottom-[4px] left-1/2 -translate-x-1/2 transform">
                        {content?.circleType === "post" ? (
                            <div className="h-9 w-9">
                                <Image
                                    className={`h-9 w-9 rounded-full border-2 bg-white ${contentPreview && contentPreview.content?._id === content?._id ? "border-[#f8dd53]" : "border-white"} bg-cover bg-center shadow-md transition-transform duration-300 group-hover:scale-110`}
                                    src="/images/default-post-picture.png"
                                    alt="Post"
                                    width={36}
                                    height={36}
                                />
                            </div>
                        ) : (
                            <div
                                className={`h-9 w-9 rounded-full border-2 bg-white ${contentPreview && contentPreview.content?._id === content?._id ? "border-[#f8dd53]" : "border-white"} bg-cover bg-center shadow-md transition-transform duration-300 group-hover:scale-110`}
                                style={{
                                    backgroundImage: content?.picture?.url ? `url(${content?.picture?.url})` : "none",
                                }}
                            />
                        )}
                    </div>
                    <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 transform rounded-full bg-white shadow-md" />
                </div>
            </HoverCardTrigger>
            <HoverCardContent
                className="w-auto cursor-pointer rounded-[60px] border-0 bg-[#333333] p-2 pr-4 pt-[6px]"
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
                    <div>
                        {content?.circleType === "post" ? (
                            <p className="line-clamp-2 max-w-[300px] text-[14px] text-white">{content?.content}</p>
                        ) : (
                            <p className="text-[14px] font-semibold text-white">{content?.name}</p>
                        )}
                        <div className="flex flex-row">
                            {(content as WithMetric<Content>)?.metrics && (
                                <Indicators
                                    metrics={(content as WithMetric<Content>).metrics!}
                                    className="mr-auto bg-transparent pl-0 shadow-none"
                                    color="#ffffff"
                                    content={content}
                                    onMapPinClick={handleMapPinClick}
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

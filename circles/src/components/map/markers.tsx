"use client";

import { contentPreviewAtom, zoomContentAtom } from "@/lib/data/atoms";
import { Content, ContentPreviewData } from "@/models/models";
import { useAtom, useSetAtom } from "jotai";
import React from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { HoverCardArrow } from "@radix-ui/react-hover-card";
import Indicators from "../utils/indicators";

interface MapMarkerProps {
    content?: Content;
    onClick?: (content: Content) => void;
    onMapPinClick?: (content: Content) => void;
}

const MapMarker: React.FC<MapMarkerProps> = ({ content, onClick, onMapPinClick }) => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [zoomContent, setZoomContent] = useAtom(zoomContentAtom);

    const handleClick = () => {
        if (!content) return;

        console.log("content clicked");
        let contentPreviewData: ContentPreviewData = {
            type: content.circleType,
            content: content,
        };
        setContentPreview(contentPreviewData);
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
                        <div
                            className={`h-9 w-9 rounded-full border-2 bg-white ${contentPreview && contentPreview.handle === content?.handle ? "border-[#f8dd53]" : "border-white"} bg-cover bg-center shadow-md transition-transform duration-300 group-hover:scale-110`}
                            style={{
                                backgroundImage: content?.picture?.url ? `url(${content?.picture?.url})` : "none",
                            }}
                        />
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
                    <div
                        className={`h-9 w-9 rounded-full bg-white bg-cover bg-center shadow-md`}
                        style={{ backgroundImage: content?.picture?.url ? `url(${content?.picture?.url})` : "none" }}
                    />
                    <div>
                        <p className="text-[14px] font-semibold text-white">{content?.name}</p>
                        <div className="flex flex-row">
                            {content?.metrics && (
                                <Indicators
                                    metrics={content?.metrics}
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

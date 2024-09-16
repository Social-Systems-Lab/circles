"use client";

import { contentPreviewAtom } from "@/lib/data/atoms";
import { Content, ContentPreviewData } from "@/models/models";
import { useAtom, useSetAtom } from "jotai";
import React from "react";

interface MapMarkerProps {
    content?: Content;
    onClick?: (content: Content) => void;
}

const MapMarker: React.FC<MapMarkerProps> = ({ content, onClick }) => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);

    const handleClick = () => {
        if (content) {
            console.log("content clicked");
            let contentPreviewData: ContentPreviewData = {
                type: content.circleType,
                content: content,
            };
            setContentPreview(contentPreviewData);
            if (onClick) {
                onClick(content);
            }
        }
    };

    return (
        <div className="group relative cursor-pointer" onClick={handleClick}>
            <div className="absolute bottom-[4px] left-1/2 -translate-x-1/2 transform">
                <div
                    className={`h-9 w-9 rounded-full border-2 bg-white ${contentPreview && contentPreview.handle === content?.handle ? "border-[#f8dd53]" : "border-white"} bg-cover bg-center shadow-md transition-transform duration-300 group-hover:scale-110`}
                    style={{ backgroundImage: content?.picture?.url ? `url(${content?.picture?.url})` : "none" }}
                />
            </div>
            <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 transform rounded-full bg-white shadow-md" />
        </div>
    );
};

export default MapMarker;

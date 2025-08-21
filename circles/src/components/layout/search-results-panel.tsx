"use client";

import React, { useMemo } from "react";
import { useAtom } from "jotai";
import { sidePanelSearchStateAtom, contentPreviewAtom, zoomContentAtom, sidePanelModeAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Indicators from "@/components/utils/indicators";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { Content, ContentPreviewData } from "@/models/models";

export default function SearchResultsPanel() {
    const [searchState] = useAtom(sidePanelSearchStateAtom);
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const [, setSidePanelMode] = useAtom(sidePanelModeAtom);

    const items = searchState.items || [];

    const header = useMemo(() => {
        if (searchState.isSearching) return `Searching…`;
        if (searchState.query) return `Results for "${searchState.query}"`;
        if (searchState.hasSearched) return `No results`;
        return `Search`;
    }, [searchState.isSearching, searchState.query, searchState.hasSearched]);

    const handleItemClick = (item: any) => {
        // Zoom map if possible
        if (item?.location?.lngLat) {
            setZoomContent(item as unknown as Content);
        }
        // Open right-side content preview
        const preview: ContentPreviewData = {
            // circleType can be "user" | "circle" | "project". Default to "circle".
            type: (item.circleType || "circle") as any,
            content: item as any,
        };
        setContentPreview(preview);
    };

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-sm font-semibold">{header}</div>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSidePanelMode("none")}>
                    Close
                </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {searchState.isSearching && <div className="p-4 text-sm text-gray-600">Loading…</div>}
                {!searchState.isSearching && items.length === 0 && searchState.hasSearched && (
                    <div className="p-4 text-sm text-gray-500">No results found.</div>
                )}
                {!searchState.isSearching && items.length > 0 && (
                    <ul className="space-y-1">
                        {items.map((item: any) => (
                            <li
                                key={item._id}
                                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 hover:bg-gray-100"
                                onClick={() => handleItemClick(item)}
                                title={
                                    item.location?.lngLat
                                        ? "Click to focus map and view details"
                                        : "Click to view details"
                                }
                            >
                                <div className="relative">
                                    <CirclePicture circle={item} size="40px" showTypeIndicator={true} />
                                </div>
                                <div className="relative flex-1 overflow-hidden pl-2">
                                    <div className="truncate p-0 text-sm font-medium">
                                        {"name" in item && item.name ? item.name : "Announcement"}
                                    </div>
                                    <div className="mt-1 line-clamp-2 p-0 text-xs text-gray-500">
                                        {"description" in item
                                            ? (item.description ?? ("mission" in item ? item.mission : "") ?? "")
                                            : "content" in item && typeof item.content === "string"
                                              ? item.content.substring(0, 70) + (item.content.length > 70 ? "..." : "")
                                              : ""}
                                    </div>
                                    {"metrics" in item && item.metrics && (
                                        <div className="flex flex-row pt-1">
                                            <Indicators className="pointer-events-none" metrics={item.metrics} />
                                            <div className="flex-1" />
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

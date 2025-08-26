"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { sidePanelSearchStateAtom, contentPreviewAtom, zoomContentAtom, sidePanelModeAtom, mapSearchCommandAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { X, Search, Calendar as CalendarIcon } from "lucide-react";
import Indicators from "@/components/utils/indicators";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { Content, ContentPreviewData, EventDisplay } from "@/models/models";
import { format } from "date-fns";

export default function SearchResultsPanel() {
    const [searchState] = useAtom(sidePanelSearchStateAtom);
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const [, setSidePanelMode] = useAtom(sidePanelModeAtom);
    const [, setMapSearchCommand] = useAtom(mapSearchCommandAtom);

    const [query, setQuery] = useState(searchState.query || "");
    useEffect(() => {
        setQuery(searchState.query || "");
    }, [searchState.query]);

    const items = searchState.items || [];

    // No header in side panel per design; keep internal state if needed later

    const handleItemClick = (item: any) => {
        // Zoom map if possible
        if (item?.location?.lngLat) {
            setZoomContent(item as unknown as Content);
        }
        // Open right-side content preview
        if (item && item.startAt && item.title) {
            const preview: ContentPreviewData = {
                type: "event",
                content: item as EventDisplay,
                props: { circleHandle: item?.circle?.handle || "" },
            };
            setContentPreview(preview);
        } else {
            const preview: ContentPreviewData = {
                // circleType can be "user" | "circle" | "project". Default to "circle".
                type: (item.circleType || "circle") as any,
                content: item as any,
            };
            setContentPreview(preview);
        }
    };

    return (
        <div className="flex h-full w-full flex-col bg-white">
            {/* Header with search input moved into panel */}
            <div className="sticky top-0 z-10 border-b bg-white px-3 py-2">
                <div className="mb-2 text-sm font-semibold">Search results</div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                setMapSearchCommand({ query, timestamp: Date.now() });
                            }
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300"
                    />
                    {query && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            onClick={() => setMapSearchCommand({ query: "", timestamp: Date.now() })}
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={!query.trim()}
                        onClick={() => setMapSearchCommand({ query, timestamp: Date.now() })}
                        aria-label="Search"
                    >
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                    {searchState.isSearching ? "Searching…" : `${items.length} result${items.length === 1 ? "" : "s"}`}
                </div>
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
                                        {"startAt" in item && (item as any).title ? (
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarIcon className="h-3.5 w-3.5 text-gray-600" />
                                                {(item as any).title}
                                            </span>
                                        ) : (
                                            ("name" in item && item.name ? item.name : "Announcement")
                                        )}
                                    </div>
                                    <div className="mt-1 line-clamp-2 p-0 text-xs text-gray-500">
                                        {"startAt" in item && (item as any).startAt
                                            ? `${format(new Date((item as any).startAt), "PPpp")}${
                                                  "endAt" in item && (item as any).endAt
                                                      ? " — " + format(new Date((item as any).endAt), "PPpp")
                                                      : ""
                                              }`
                                            : ("description" in item
                                                  ? (item.description ??
                                                        ("mission" in item ? (item as any).mission : "") ??
                                                        "")
                                                  : ("content" in item && typeof (item as any).content === "string"
                                                        ? (item as any).content.substring(0, 70) +
                                                          ((item as any).content.length > 70 ? "..." : "")
                                                        : ""))}
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

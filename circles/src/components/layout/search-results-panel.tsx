"use client";

import React, { useMemo } from "react";
import { useAtom } from "jotai";
import { sidePanelSearchStateAtom, contentPreviewAtom, zoomContentAtom } from "@/lib/data/atoms";
import { Calendar as CalendarIcon } from "lucide-react";
import Indicators from "@/components/utils/indicators";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { Content, ContentPreviewData, EventDisplay } from "@/models/models";
import { format } from "date-fns";

const SEARCH_CATEGORY_LABELS: Record<string, string> = {
    users: "people",
    communities: "circles",
    projects: "projects",
};

export default function SearchResultsPanel() {
    const [searchState] = useAtom(sidePanelSearchStateAtom);
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [, setZoomContent] = useAtom(zoomContentAtom);

    const items = searchState.items || [];
    const filterSummary = useMemo(() => {
        const parts: string[] = [];

        if (searchState.selectedCategory && searchState.selectedCategory !== "events") {
            parts.push(SEARCH_CATEGORY_LABELS[searchState.selectedCategory] ?? searchState.selectedCategory);
        }

        if ((searchState.selectedSdgHandles || []).length > 0) {
            parts.push(`${(searchState.selectedSdgHandles || []).length} SDG`);
        }

        if (searchState.selectedDateLabel) {
            parts.push(searchState.selectedDateLabel);
        }

        return parts.join(" · ");
    }, [searchState.selectedCategory, searchState.selectedSdgHandles, searchState.selectedDateLabel]);

    const emptyState = useMemo(() => {
        const trimmedQuery = searchState.query.trim();
        const context: string[] = [];

        if (trimmedQuery) {
            context.push(`for "${trimmedQuery}"`);
        }

        if (searchState.selectedCategory && searchState.selectedCategory !== "events") {
            context.push(
                `in ${SEARCH_CATEGORY_LABELS[searchState.selectedCategory] ?? searchState.selectedCategory}`,
            );
        }

        if ((searchState.selectedSdgHandles || []).length > 0) {
            context.push(
                `with ${(searchState.selectedSdgHandles || []).length} SDG filter${
                    (searchState.selectedSdgHandles || []).length === 1 ? "" : "s"
                }`,
            );
        }

        if (searchState.selectedDateLabel) {
            context.push(`inside ${searchState.selectedDateLabel}`);
        }

        return {
            title: `No ${
                searchState.selectedCategory && searchState.selectedCategory !== "events"
                    ? SEARCH_CATEGORY_LABELS[searchState.selectedCategory] ?? searchState.selectedCategory
                    : "results"
            } found`,
            description:
                context.length > 0
                    ? `Nothing matched ${context.join(" ")}. Try broadening the query or removing a filter.`
                    : "Try a broader query or switch result types.",
        };
    }, [
        searchState.query,
        searchState.selectedCategory,
        searchState.selectedSdgHandles,
        searchState.selectedDateLabel,
    ]);

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
            <div className="sticky top-0 z-10 border-b bg-white px-3 py-2">
                <div className="mb-2 text-sm font-semibold">Search results</div>
                {searchState.query && <div className="text-sm text-gray-700">Query: “{searchState.query}”</div>}
                <div className="mt-1 text-xs text-gray-500">
                    {searchState.isSearching
                        ? "Searching…"
                        : `${items.length} result${items.length === 1 ? "" : "s"} · ${
                              searchState.counts?.users ?? 0
                          } people · ${searchState.counts?.communities ?? 0} circles · ${
                              searchState.counts?.projects ?? 0
                          } projects`}
                </div>
                {filterSummary && <div className="mt-1 text-xs text-gray-500">Filters: {filterSummary}</div>}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hover stable-scrollbar">
                {searchState.isSearching && <div className="p-4 text-sm text-gray-600">Loading…</div>}
                {!searchState.isSearching && items.length === 0 && searchState.hasSearched && (
                    <div className="p-4">
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                            <div className="text-sm font-medium text-gray-900">{emptyState.title}</div>
                            <div className="mt-2 text-sm text-gray-500">{emptyState.description}</div>
                        </div>
                    </div>
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
                                            ("name" in item && item.name ? item.name : "Post")
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

"use client";

import React, { useCallback } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AiOutlineRead } from "react-icons/ai";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { sidePanelWidth } from "../../app/constants";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import { useAtom } from "jotai";
import {
    mapboxKeyAtom,
    mapOpenAtom,
    displayedContentAtom,
    contentPreviewAtom,
    triggerMapOpenAtom,
    zoomContentAtom,
    focusPostAtom,
    sidePanelContentVisibleAtom,
    sidePanelModeAtom,
    feedPanelDockedAtom,
} from "@/lib/data/atoms";
import MapMarker from "./markers";
import { isEqual } from "lodash"; // You might need to install lodash
import { motion } from "framer-motion";
import Image from "next/image";
import { usePathname } from "next/navigation";
import ContentPreview from "../layout/content-preview";
import { Content, ContentPreviewData, Location, PostDisplay, EventDisplay } from "@/models/models";
import ImageGallery from "../layout/image-gallery";
import { TbFocus2 } from "react-icons/tb";
import Onboarding from "../onboarding/onboarding";
import { Dialog, DialogContent } from "../ui/dialog";
import { precisionLevels } from "../forms/location-picker";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useIsMobile } from "../utils/use-is-mobile";

const isPostDisplay = (c: any): c is PostDisplay => {
    return c && (c as any).circleType === "post";
};

const MapBox = ({
    mapboxKey,
    panelMode,
    windowWidth,
    windowHeight,
    feedPanelDocked,
}: {
    mapboxKey: string;
    panelMode?: string;
    windowWidth: number;
    windowHeight: number;
    feedPanelDocked?: boolean;
}) => {
    const mapContainer = useRef(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [displayedContent] = useAtom(displayedContentAtom);
    const [zoomContent, setZoomContent] = useAtom(zoomContentAtom);
    const [lng, setLng] = useState(20);
    const [lat, setLat] = useState(20);
    const [zoom, setZoom] = useState(2.2);
    mapboxgl.accessToken = mapboxKey;
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [, setFocusPost] = useAtom(focusPostAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const isMobile = useIsMobile();
    const pathname = usePathname();

    const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
    const focusedMarkerIdsRef = useRef<Set<string>>(new Set());
    const lastFocusedMarkerIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.MapBox.1");
        }
    }, []);

    const onMarkerClick = useCallback(
        (content: Content) => {
            if (isPostDisplay(content)) {
                setFocusPost(content as PostDisplay);
                return;
            }

            const isEvent = (c: any): c is EventDisplay => !!(c && (c as any).startAt && (c as any).title);

            let nextPreview: ContentPreviewData;
            if (isEvent(content)) {
                const circleHandle = (content as any)?.circle?.handle ?? "";
                nextPreview = {
                    type: "event",
                    content: content as EventDisplay,
                    props: { circleHandle },
                };
            } else {
                const previewType = (content as any).circleType || "circle";
                nextPreview = {
                    type: previewType as any,
                    content: content,
                } as any;
            }

            setContentPreview((x) =>
                content === x?.content && sidePanelContentVisible === "content" ? undefined : nextPreview,
            );
        },
        [setContentPreview, sidePanelContentVisible],
    );

    const onMapPinClick = useCallback(
        (content: Content) => {
            setZoomContent(content);
        },
        [setZoomContent],
    );

    useEffect(() => {
        if (!mapContainer.current) {
            return; // wait for map container to be available
        }
        if (map.current) return; // initialize map only once
        if (!mapboxKey) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [lng, lat],
            zoom: zoom,
            //maxZoom: 12, // Limit maximum zoom to city level
        });
    }, [mapContainer, lat, lng, zoom, mapboxKey, displayedContent]);

    // Ensure Mapbox resizes when container size changes (handles animations and window resize)
    useEffect(() => {
        if (!map.current || !mapContainer.current) return;

        const resizeObserver = new ResizeObserver(() => {
            map.current?.resize();
        });

        resizeObserver.observe(mapContainer.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!map.current || !displayedContent) return;

        const currentMarkerIds = new Set(markersRef.current.keys());

        displayedContent.forEach((item) => {
            if (item?.location?.lngLat) {
                const markerId = item._id;
                const existingMarker = markersRef.current.get(markerId);

                if (existingMarker) {
                    // Update existing marker if location changed
                    if (!isEqual(existingMarker.getLngLat(), item.location.lngLat)) {
                        existingMarker.setLngLat(item.location.lngLat);
                    }
                    currentMarkerIds.delete(markerId);
                    focusedMarkerIdsRef.current.delete(markerId);
                } else {
                    // Create new marker
                    const markerElement = document?.createElement("div");
                    const root = createRoot(markerElement);
                    root.render(<MapMarker content={item} onClick={onMarkerClick} onMapPinClick={onMapPinClick} />);

                    const newMarker = new mapboxgl.Marker(markerElement)
                        .setLngLat(item.location.lngLat)
                        .addTo(map.current!);

                    markersRef.current.set(markerId, newMarker);
                }
            }
        });

        // Remove markers that are no longer in displayedContent
        currentMarkerIds.forEach((id) => {
            if (focusedMarkerIdsRef.current.has(id)) {
                return;
            }
            const markerToRemove = markersRef.current.get(id);
            if (markerToRemove) {
                markerToRemove.remove();
                markersRef.current.delete(id);
            }
        });
    }, [displayedContent, onMarkerClick, onMapPinClick]);

    useEffect(() => {
        // console.log("Zooming to content", zoomContent);
        if (!zoomContent) {
            return;
        }

        // zoom in on content
        let location = zoomContent?.location as Location;
        if (location?.lngLat) {
            const markerId = (zoomContent as any)?._id;
            if (markerId) {
                const previousFocusedId = lastFocusedMarkerIdRef.current;
                if (
                    previousFocusedId &&
                    previousFocusedId !== markerId &&
                    focusedMarkerIdsRef.current.has(previousFocusedId)
                ) {
                    const previousMarker = markersRef.current.get(previousFocusedId);
                    if (previousMarker) {
                        previousMarker.remove();
                        markersRef.current.delete(previousFocusedId);
                    }
                    focusedMarkerIdsRef.current.delete(previousFocusedId);
                }

                lastFocusedMarkerIdRef.current = markerId;

                if (!markersRef.current.has(markerId) && map.current) {
                    const markerElement = document?.createElement("div");
                    const root = createRoot(markerElement);
                    root.render(
                        <MapMarker
                            content={zoomContent}
                            onClick={onMarkerClick}
                            onMapPinClick={onMapPinClick}
                        />,
                    );

                    const focusMarker = new mapboxgl.Marker(markerElement).setLngLat(location.lngLat).addTo(map.current);
                    markersRef.current.set(markerId, focusMarker);
                    focusedMarkerIdsRef.current.add(markerId);
                }
            }

            // Get the zoom level based on precision
            const computedPrecisionZoom = precisionLevels[location.precision as number]?.zoom;
            const desiredZoom = computedPrecisionZoom ?? 14;

            // Allow closer focus for street-level pins while keeping a sensible cap
            const MAX_FOCUSED_PIN_ZOOM = 17;
            const finalZoom =
                typeof location.precision === "number" && location.precision >= 3
                    ? Math.min(desiredZoom, MAX_FOCUSED_PIN_ZOOM)
                    : desiredZoom;

            const PREVIEW_PANEL_WIDTH = 400;
            const PREVIEW_PANEL_GUTTER = 32;
            let previewOffsetX = 0;
            // User requested to center the pin on the screen, even if it's obscured by the panel.
            // So we remove the offset calculation.
            if (zoomContent) {
                 previewOffsetX = 0;
            }

            const targetLng = (location.lngLat as any)?.lng;
            const targetLat = (location.lngLat as any)?.lat;
            if (typeof targetLng !== "number" || typeof targetLat !== "number") {
                map.current?.flyTo({
                    center: location.lngLat as any,
                    zoom: finalZoom,
                    offset: [previewOffsetX, 0],
                    essential: true,
                });
                return;
            }

            const currentCenter = map.current?.getCenter();
            const currentZoom = map.current?.getZoom();
            const centerTolerance = 0.00005; // ≈5m latitude/longitude tolerance
            const zoomTolerance = 0.01;
            const isCenterClose =
                !!currentCenter &&
                Math.abs(currentCenter.lng - targetLng) < centerTolerance &&
                Math.abs(currentCenter.lat - targetLat) < centerTolerance;
            const isZoomClose = currentZoom !== undefined && Math.abs(currentZoom - finalZoom) < zoomTolerance;

            if (isCenterClose && isZoomClose) {
                return;
            }

            map.current?.flyTo({
                center: location.lngLat,
                zoom: finalZoom,
                offset: [previewOffsetX, 0],
                essential: true, // this animation is considered essential with respect to prefers-reduced-motion
            });
        }
        setZoomContent(undefined);
    }, [zoomContent, onMarkerClick, onMapPinClick, contentPreview, isMobile]);

    // Bring selected marker to front
    const elevatedMarkerIdRef = useRef<string | null>(null);
    useEffect(() => {
        // Reset previous elevated marker
        if (elevatedMarkerIdRef.current) {
            const prevMarker = markersRef.current.get(elevatedMarkerIdRef.current);
            if (prevMarker) {
                prevMarker.getElement().style.zIndex = "";
            }
            elevatedMarkerIdRef.current = null;
        }

        let targetId = contentPreview?.content?._id;

        // If no preview content, try to get ID from URL
        if (!targetId && pathname) {
            // Match /events/[id] but exclude /events/create
            const match = pathname.match(/\/events\/([^\/]+)/);
            if (match && match[1] && match[1] !== "create") {
                targetId = match[1];
            }
        }

        // Elevate new marker if content is selected
        if (targetId) {
            const marker = markersRef.current.get(targetId);
            if (marker) {
                marker.getElement().style.zIndex = "1000";
                elevatedMarkerIdRef.current = targetId;
            }
        }
    }, [contentPreview, pathname]);

    // Function to zoom in on user's location
    const zoomToUserLocation = useCallback(() => {
        navigator.geolocation.getCurrentPosition((position) => {
            const userLng = position.coords.longitude;
            const userLat = position.coords.latitude;

            if (map.current) {
                map.current.flyTo({
                    center: [userLng, userLat],
                    zoom: 12, // City-level zoom
                    essential: true, // this animation is considered essential with respect to prefers-reduced-motion
                });
            }
        });
    }, []);

    return (
        <div className="relative h-full w-full">
            <div ref={mapContainer} className="map-container z-10" style={{ width: "100%", height: "100%" }} />
            {/* Add the button for zooming into the user's location */}
            <div
                className="fixed bottom-[90px] right-6 z-[50] cursor-pointer rounded-full bg-[#242424] p-[2px] hover:bg-[#304678e6] md:bottom-[40px]"
                onClick={zoomToUserLocation}
            >
                <TbFocus2 className="m-[4px] text-white group-hover:text-white" size="30px" />
            </div>
        </div>
    );
};

export function MapDisplay({ mapboxKey }: { mapboxKey: string }) {
    const [, setMapboxKey] = useAtom(mapboxKeyAtom);
    const { windowWidth, windowHeight } = useWindowDimensions();
    const isMobile = windowWidth <= 768;
    const [panelMode] = useAtom(sidePanelModeAtom);
    const [feedPanelDocked] = useAtom(feedPanelDockedAtom);
    const pathname = usePathname();

    let innerWidth = 0;
    if (typeof document !== "undefined") {
        innerWidth = document.documentElement.offsetWidth;
    }

    const desktopPanelWidth = 420;
    const isOverlayPanel =
        !isMobile &&
        pathname === "/explore" &&
        ((panelMode === "activity" && !feedPanelDocked) || panelMode === "events");
    const panelWidth = !isMobile && panelMode !== "none" && !isOverlayPanel ? desktopPanelWidth : 0;
    const mapWidth = isMobile ? innerWidth : innerWidth - 72 - panelWidth;
    const prevWindowWidth = useRef(windowWidth);
    const isResizing = prevWindowWidth.current !== windowWidth;

    useEffect(() => {
        prevWindowWidth.current = windowWidth;
    }, [windowWidth]);

    const widthTransition = isResizing ? "none" : "width 0.35s ease-in-out";

    useEffect(() => {
        if (mapboxKey) {
            setMapboxKey(mapboxKey);
        }
    }, [mapboxKey, setMapboxKey]);

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <div className="relative flex w-full flex-row overflow-hidden bg-[#2e4c6b]">
            {mapboxKey && (
                <>
                    <div
                        className="relative"
                        style={{
                            width: mapWidth,
                            height: windowHeight - (isMobile ? 72 : 0) + "px",
                            transition: widthTransition,
                        }}
                    ></div>
                    <div
                        className={"fixed right-0 z-30"}
                        style={{
                            width: mapWidth,
                            height: windowHeight - (isMobile ? 72 : 0) + "px",
                            transition: widthTransition,
                        }}
                    >
                        <MapBox
                            mapboxKey={mapboxKey}
                            panelMode={panelMode}
                            windowWidth={windowWidth}
                            windowHeight={windowHeight}
                            feedPanelDocked={feedPanelDocked}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

"use client";

import React, { useCallback } from "react";
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

const isEventDisplay = (content: any): content is EventDisplay => !!(content && content.startAt && content.title);

const getLngLatParts = (lngLat: any): { lng: number; lat: number } | undefined => {
    const lng = Array.isArray(lngLat) ? lngLat[0] : lngLat?.lng;
    const lat = Array.isArray(lngLat) ? lngLat[1] : lngLat?.lat;
    return typeof lng === "number" && typeof lat === "number" ? { lng, lat } : undefined;
};

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const getAngularDistance = (a: { lng: number; lat: number }, b: { lng: number; lat: number }): number => {
    const lat1 = degreesToRadians(a.lat);
    const lat2 = degreesToRadians(b.lat);
    const deltaLat = degreesToRadians(b.lat - a.lat);
    const deltaLng = degreesToRadians(b.lng - a.lng);
    const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const getMarkerTitle = (content: Content): string => {
    if (isEventDisplay(content)) {
        return content.title ?? "Event";
    }
    if ((content as any)?.circleType === "post") {
        return (content as any)?.content?.slice(0, 80) ?? "Noticeboard post";
    }
    return (content as any)?.name ?? "Map item";
};

const getMarkerInitials = (content: Content): string => {
    const title = getMarkerTitle(content).trim();
    if (!title) {
        return "";
    }
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }
    return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();
};

const getMarkerImageUrl = (content: Content): string | undefined => {
    const item = content as any;
    if (isEventDisplay(content)) {
        return item.images?.[0]?.fileInfo?.url ?? item.cover?.url ?? item.picture?.url;
    }
    if (item.circleType === "post") {
        return item.media?.[0]?.fileInfo?.url ?? "/images/default-post-picture.png";
    }
    return item.picture?.url ?? item.images?.[0]?.fileInfo?.url;
};

const getMarkerDescription = (content: Content): string => {
    if (isEventDisplay(content)) {
        return (content as any)?.description ?? "";
    }
    if ((content as any)?.circleType === "post") {
        return (content as any)?.content ?? "";
    }
    return (content as any)?.mission ?? (content as any)?.description ?? "";
};

const getMarkerOpenHref = (content: Content): string | undefined => {
    if (isEventDisplay(content)) {
        const circleHandle = (content as any)?.circle?.handle;
        return circleHandle && content._id ? `/circles/${circleHandle}/events/${content._id}` : undefined;
    }
    if ((content as any)?.handle && (content as any)?.circleType !== "post") {
        return `/circles/${(content as any).handle}`;
    }
    return undefined;
};

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const createMarkerPopupHtml = (content: Content): string => {
    const title = escapeHtml(getMarkerTitle(content));
    const description = escapeHtml(getMarkerDescription(content)).slice(0, 180);
    const imageUrl =
        getMarkerImageUrl(content) ??
        ((content as any)?.circleType === "post"
            ? "/images/default-post-picture.png"
            : "/images/default-user-cover.png");
    const openHref = getMarkerOpenHref(content);
    const openLink = openHref
        ? `<a href="${escapeHtml(openHref)}" style="display:inline-flex;height:34px;align-items:center;border-radius:9999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);padding:0 13px;font-size:13px;font-weight:600;color:#fff;text-decoration:none;">Open</a>`
        : "";

    return `
        <div style="position:relative;width:320px;height:200px;overflow:hidden;border-radius:15px;background:#111827;box-shadow:0 12px 34px rgba(15,23,42,.28);">
            <div style="position:absolute;inset:0;background-image:url('${escapeHtml(imageUrl)}');background-size:cover;background-position:center;"></div>
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.82),rgba(0,0,0,.36) 52%,rgba(0,0,0,.03));"></div>
            <div style="position:absolute;left:0;right:0;bottom:0;padding:12px;">
                <div style="font-size:16px;font-weight:700;line-height:1.25;color:#fff;">${title}</div>
                ${description ? `<div style="margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.35;color:rgba(255,255,255,.9);">${description}</div>` : ""}
                ${openLink ? `<div style="margin-top:9px;">${openLink}</div>` : ""}
            </div>
        </div>
    `;
};

const getMarkerTheme = (content: Content): { background: string; color: string; size: number } => {
    if (isEventDisplay(content)) {
        return { background: "#f8dd53", color: "#332700", size: 34 };
    }
    if ((content as any)?.circleType === "post") {
        return { background: "#36516f", color: "#ffffff", size: 36 };
    }
    if ((content as any)?.circleType === "user") {
        return { background: "#f4f1e8", color: "#253247", size: 40 };
    }
    if ((content as any)?.circleType === "project") {
        return { background: "#dbeafe", color: "#1e3a8a", size: 40 };
    }
    return { background: "#ffffff", color: "#253247", size: 40 };
};

const setMarkerSelected = (element: HTMLElement, selected: boolean) => {
    element.dataset.selected = selected ? "true" : "false";
    element.style.zIndex = selected ? "1000" : "";
    const face = element.querySelector<HTMLElement>("[data-marker-face]");
    if (face) {
        face.style.borderColor = selected ? "#f8dd53" : "#ffffff";
        face.style.boxShadow = selected ? "0 0 0 3px rgba(248, 221, 83, 0.35)" : "0 1px 4px rgba(15, 23, 42, 0.2)";
        face.style.transform = selected ? "scale(1.08)" : "";
    }
};

const createMarkerElement = (
    content: Content,
    onClick: (content: Content) => void,
    onHover: (content: Content, element: HTMLElement) => void,
    onLeave: () => void,
): HTMLDivElement => {
    const theme = getMarkerTheme(content);
    const imageUrl = getMarkerImageUrl(content);
    const markerElement = document.createElement("div");
    markerElement.title = getMarkerTitle(content);
    markerElement.setAttribute("aria-label", markerElement.title);
    markerElement.style.width = `${theme.size}px`;
    markerElement.style.height = `${theme.size + 8}px`;
    markerElement.style.cursor = "pointer";
    markerElement.style.position = "absolute";
    markerElement.style.left = "0";
    markerElement.style.top = "0";
    markerElement.style.willChange = "transform";
    markerElement.style.pointerEvents = "auto";

    const face = document.createElement("div");
    face.dataset.markerFace = "true";
    if (!imageUrl || isEventDisplay(content)) {
        face.textContent = isEventDisplay(content)
            ? new Date(content.startAt).getDate().toString()
            : getMarkerInitials(content);
    }
    face.style.position = "absolute";
    face.style.left = "0";
    face.style.top = "0";
    face.style.display = "flex";
    face.style.alignItems = "center";
    face.style.justifyContent = "center";
    face.style.width = `${theme.size}px`;
    face.style.height = `${theme.size}px`;
    face.style.borderRadius = "9999px";
    face.style.border = "2px solid #ffffff";
    face.style.backgroundColor = theme.background;
    if (imageUrl && !isEventDisplay(content)) {
        face.style.backgroundImage = `url("${imageUrl}")`;
        face.style.backgroundPosition = "center";
        face.style.backgroundSize = "cover";
    }
    face.style.color = theme.color;
    face.style.fontSize = isEventDisplay(content) ? "12px" : "11px";
    face.style.fontWeight = "700";
    face.style.letterSpacing = "0";
    face.style.lineHeight = "1";
    face.style.boxShadow = "0 1px 4px rgba(15, 23, 42, 0.2)";
    face.style.transition = "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease";
    face.style.pointerEvents = "none";

    const pointer = document.createElement("div");
    pointer.style.position = "absolute";
    pointer.style.left = "50%";
    pointer.style.bottom = "0";
    pointer.style.width = "8px";
    pointer.style.height = "8px";
    pointer.style.borderRadius = "9999px";
    pointer.style.background = "#ffffff";
    pointer.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.16)";
    pointer.style.transform = "translateX(-50%)";
    pointer.style.pointerEvents = "none";

    markerElement.addEventListener("mouseenter", () => {
        face.style.transform = "scale(1.12)";
        face.style.boxShadow = "0 3px 8px rgba(15, 23, 42, 0.26)";
        onHover(content, markerElement);
    });
    markerElement.addEventListener("mouseleave", () => {
        if (markerElement.dataset.selected !== "true") {
            face.style.transform = "";
            face.style.boxShadow = "0 1px 4px rgba(15, 23, 42, 0.2)";
        }
        onLeave();
    });
    markerElement.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick(content);
    });

    markerElement.appendChild(face);
    markerElement.appendChild(pointer);
    return markerElement;
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
    const markerOverlay = useRef<HTMLDivElement | null>(null);
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

    const markersRef = useRef<Map<string, HTMLElement>>(new globalThis.Map());
    const focusedMarkerIdsRef = useRef<Set<string>>(new Set());
    const lastFocusedMarkerIdRef = useRef<string | null>(null);
    const markerContentRef = useRef<Map<string, Content>>(new globalThis.Map());
    const popupRef = useRef<HTMLDivElement | null>(null);
    const popupContentRef = useRef<Content | null>(null);
    const popupCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        [setContentPreview, setFocusPost, sidePanelContentVisible],
    );

    const closeMarkerPopup = useCallback(() => {
        if (popupCloseTimeoutRef.current) {
            clearTimeout(popupCloseTimeoutRef.current);
        }
        popupCloseTimeoutRef.current = setTimeout(() => {
            if (popupRef.current) {
                popupRef.current.style.display = "none";
            }
            popupContentRef.current = null;
        }, 120);
    }, []);

    const openMarkerPopup = useCallback(
        (content: Content, element: HTMLElement) => {
            if (!map.current || !markerOverlay.current || !content.location?.lngLat) {
                return;
            }

            if (popupCloseTimeoutRef.current) {
                clearTimeout(popupCloseTimeoutRef.current);
                popupCloseTimeoutRef.current = null;
            }

            if (!popupRef.current) {
                popupRef.current = document.createElement("div");
                popupRef.current.className = "map-marker-preview-popup";
                popupRef.current.style.position = "absolute";
                popupRef.current.style.left = "0";
                popupRef.current.style.top = "0";
                popupRef.current.style.zIndex = "100000";
                popupRef.current.style.pointerEvents = "auto";
                popupRef.current.style.willChange = "transform";
                popupRef.current.addEventListener("mouseenter", () => {
                    if (popupCloseTimeoutRef.current) {
                        clearTimeout(popupCloseTimeoutRef.current);
                        popupCloseTimeoutRef.current = null;
                    }
                });
                popupRef.current.addEventListener("mouseleave", closeMarkerPopup);
                markerOverlay.current.appendChild(popupRef.current);
            }

            popupContentRef.current = content;
            popupRef.current.innerHTML = createMarkerPopupHtml(content);
            popupRef.current.style.display = "";
            const point = map.current.project(content.location.lngLat as any);
            popupRef.current.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, calc(-100% - 18px))`;
        },
        [closeMarkerPopup],
    );

    const syncMarkerPositions = useCallback(() => {
        if (!map.current || !mapContainer.current || !markerOverlay.current) {
            return;
        }

        const mapElement = mapContainer.current as HTMLElement;
        const { width, height } = mapElement.getBoundingClientRect();
        const mapCenter = map.current.getCenter();
        const centerLngLat = { lng: mapCenter.lng, lat: mapCenter.lat };
        const isGlobe = map.current.getProjection?.()?.name === "globe";

        markersRef.current.forEach((marker, id) => {
            const content = markerContentRef.current.get(id);
            if (!content?.location?.lngLat) {
                return;
            }

            const lngLat = getLngLatParts(content.location.lngLat);
            if (!lngLat) {
                marker.style.display = "none";
                return;
            }

            const point = map.current!.project(content.location.lngLat as any);
            const isOutsideViewport = point.x < -80 || point.x > width + 80 || point.y < -80 || point.y > height + 80;
            const isBehindGlobe = isGlobe && getAngularDistance(centerLngLat, lngLat) > Math.PI / 2;
            const isHidden = isOutsideViewport || isBehindGlobe;

            marker.style.display = isHidden ? "none" : "";
            marker.style.zIndex = isHidden ? "" : `${Math.round(point.y)}`;
            marker.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
        });

        if (popupRef.current && popupContentRef.current?.location?.lngLat) {
            const content = popupContentRef.current;
            const contentLngLat = content.location?.lngLat;
            const lngLat = getLngLatParts(contentLngLat);
            if (!lngLat) {
                popupRef.current.style.display = "none";
                return;
            }

            const point = map.current.project(contentLngLat as any);
            const isOutsideViewport =
                point.x < -160 || point.x > width + 160 || point.y < -160 || point.y > height + 160;
            const isBehindGlobe = isGlobe && getAngularDistance(centerLngLat, lngLat) > Math.PI / 2;
            popupRef.current.style.display = isOutsideViewport || isBehindGlobe ? "none" : "";
            popupRef.current.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, calc(-100% - 18px))`;
        }
    }, []);

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

        map.current.on("render", syncMarkerPositions);
    }, [mapContainer, lat, lng, zoom, mapboxKey, displayedContent, syncMarkerPositions]);

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
        if (!map.current || !markerOverlay.current || !displayedContent) return;

        const overlay = markerOverlay.current;
        const currentMarkerIds = new Set(markersRef.current.keys());

        displayedContent.forEach((item) => {
            if (item?.location?.lngLat) {
                const markerId = item._id;
                const existingMarker = markersRef.current.get(markerId);

                if (existingMarker) {
                    currentMarkerIds.delete(markerId);
                    focusedMarkerIdsRef.current.delete(markerId);
                    markerContentRef.current.set(markerId, item);
                } else {
                    // Create new marker
                    const markerElement = createMarkerElement(item, onMarkerClick, openMarkerPopup, closeMarkerPopup);
                    overlay.appendChild(markerElement);
                    markersRef.current.set(markerId, markerElement);
                    markerContentRef.current.set(markerId, item);
                }
            }
        });
        syncMarkerPositions();

        // Remove markers that are no longer in displayedContent
        currentMarkerIds.forEach((id) => {
            if (focusedMarkerIdsRef.current.has(id)) {
                return;
            }
            const markerToRemove = markersRef.current.get(id);
            if (markerToRemove) {
                markerToRemove.remove();
                markersRef.current.delete(id);
                markerContentRef.current.delete(id);
            }
        });
    }, [displayedContent, onMarkerClick, openMarkerPopup, closeMarkerPopup, syncMarkerPositions]);

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

                if (!markersRef.current.has(markerId) && map.current && markerOverlay.current) {
                    const markerElement = createMarkerElement(
                        zoomContent,
                        onMarkerClick,
                        openMarkerPopup,
                        closeMarkerPopup,
                    );

                    markerOverlay.current.appendChild(markerElement);
                    setMarkerSelected(markerElement, true);
                    markersRef.current.set(markerId, markerElement);
                    markerContentRef.current.set(markerId, zoomContent);
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
    }, [zoomContent, onMarkerClick, openMarkerPopup, closeMarkerPopup, contentPreview, isMobile, setZoomContent]);

    // Bring selected marker to front
    const elevatedMarkerIdRef = useRef<string | null>(null);
    useEffect(() => {
        // Reset previous elevated marker
        if (elevatedMarkerIdRef.current) {
            const prevMarker = markersRef.current.get(elevatedMarkerIdRef.current);
            if (prevMarker) {
                setMarkerSelected(prevMarker, false);
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
                setMarkerSelected(marker, true);
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
            <div
                ref={markerOverlay}
                className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
                aria-hidden="true"
            />
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

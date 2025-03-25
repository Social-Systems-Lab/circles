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
} from "@/lib/data/atoms";
import MapMarker from "./markers";
import { isEqual } from "lodash"; // You might need to install lodash
import { motion } from "framer-motion";
import Image from "next/image";
import ContentPreview from "../layout/content-preview";
import { Content, ContentPreviewData, Location } from "@/models/models";
import ImageGallery from "../layout/image-gallery";
import { TbFocus2 } from "react-icons/tb";
import Onboarding from "../onboarding/onboarding";
import { Dialog, DialogContent } from "../ui/dialog";
import { precisionLevels } from "../forms/location-picker";
import { SidePanel } from "../layout/side-panel";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useIsMobile } from "../utils/use-is-mobile";

const MapBox = ({ mapboxKey }: { mapboxKey: string }) => {
    const mapContainer = useRef(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [displayedContent] = useAtom(displayedContentAtom);
    const [zoomContent, setZoomContent] = useAtom(zoomContentAtom);
    const [lng, setLng] = useState(20);
    const [lat, setLat] = useState(20);
    const [zoom, setZoom] = useState(2.2);
    mapboxgl.accessToken = mapboxKey;
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [, setFocusPost] = useAtom(focusPostAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const isMobile = useIsMobile();

    const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.MapBox.1");
        }
    }, []);

    const onMarkerClick = useCallback(
        (content: Content) => {
            if (content.circleType === "post") {
                setFocusPost(content);
            } else {
                let contentPreviewData: any = {
                    type: content.circleType,
                    content: content,
                };
                setContentPreview((x) =>
                    content === x?.content && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
                );
            }
        },
        [setContentPreview],
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
            maxZoom: 12, // Limit maximum zoom to city level
        });
    }, [mapContainer, lat, lng, zoom, mapboxKey, displayedContent]);

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
            const markerToRemove = markersRef.current.get(id);
            if (markerToRemove) {
                markerToRemove.remove();
                markersRef.current.delete(id);
            }
        });
    }, [displayedContent, onMarkerClick]);

    useEffect(() => {
        // console.log("Zooming to content", zoomContent);
        if (!zoomContent) {
            return;
        }

        // zoom in on content
        let location = zoomContent?.location as Location;
        if (location?.lngLat) {
            // Get the zoom level based on precision
            let calculatedZoom = precisionLevels[location.precision].zoom ?? 14;
            
            // Limit maximum zoom to city level (12), regardless of the precision setting
            const maxZoom = 12; // City level zoom
            const finalZoom = Math.min(calculatedZoom, maxZoom);
            
            map.current?.flyTo({
                center: location.lngLat,
                zoom: finalZoom,
                essential: true, // this animation is considered essential with respect to prefers-reduced-motion
            });
        }
        setZoomContent(undefined);
    }, [zoomContent]);

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
        <div ref={mapContainer} className="map-container z-10" style={{ width: "100%", height: "100%" }}>
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

    let innerWidth = 0;
    if (typeof document !== "undefined") {
        innerWidth = document.documentElement.offsetWidth;
    }

    const mapWidth = isMobile ? innerWidth : innerWidth - 72;

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
                    <div className="relative" style={{ width: mapWidth, height: windowHeight + "px" }}></div>
                    <div className={"fixed right-0 z-30"} style={{ width: mapWidth, height: windowHeight + "px" }}>
                        <MapBox mapboxKey={mapboxKey} />
                    </div>
                </>
            )}
            <SidePanel />
        </div>
    );
}

export default function MapAndContentWrapper({
    mapboxKey,
    children,
}: {
    mapboxKey: string;
    children: React.ReactNode;
}) {
    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.MapAndContentWrapper.1");
        }
    }, []);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <div className="relative flex w-full flex-row overflow-hidden bg-[#2e4c6b]">
            <div className="relative min-h-screen overflow-x-hidden bg-[#fbfbfb]">{children}</div>

            <SidePanel />
        </div>
    );
}

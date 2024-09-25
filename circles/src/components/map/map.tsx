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
} from "@/lib/data/atoms";
import MapMarker from "./markers";
import { isEqual } from "lodash"; // You might need to install lodash
import { motion } from "framer-motion";
import Image from "next/image";
import ContentPreview from "../layout/content-preview";
import { Content, ContentPreviewData } from "@/models/models";
import ImageGallery from "../layout/image-gallery";
import { TbFocus2 } from "react-icons/tb";
import Onboarding from "../onboarding/onboarding";
import { Dialog, DialogContent } from "../ui/dialog";

const MapBox = ({ mapboxKey }: { mapboxKey: string }) => {
    const mapContainer = useRef(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [displayedContent] = useAtom(displayedContentAtom);
    const [lng, setLng] = useState(20);
    const [lat, setLat] = useState(20);
    const [zoom, setZoom] = useState(2.2);
    mapboxgl.accessToken = mapboxKey;
    const [, setContentPreview] = useAtom(contentPreviewAtom);

    const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());

    const onMarkerClick = useCallback(
        (content: Content) => {
            let contentPreviewData: ContentPreviewData = {
                type: content.circleType,
                content: content,
            };
            setContentPreview((x) => (content === x?.content ? undefined : contentPreviewData));
        },
        [setContentPreview],
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
                    root.render(<MapMarker content={item} onClick={onMarkerClick} />);

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

    // Function to zoom in on user's location
    const zoomToUserLocation = useCallback(() => {
        navigator.geolocation.getCurrentPosition((position) => {
            const userLng = position.coords.longitude;
            const userLat = position.coords.latitude;

            if (map.current) {
                map.current.flyTo({
                    center: [userLng, userLat],
                    zoom: 12, // Adjust this value for city-level zoom
                    essential: true, // this animation is considered essential with respect to prefers-reduced-motion
                });
            }
        });
    }, []);

    return (
        <div ref={mapContainer} className="map-container z-10" style={{ width: "100%", height: "100%" }}>
            {/* Add the button for zooming into the user's location */}
            <div
                className="fixed bottom-[160px] right-6 z-[50] cursor-pointer rounded-full bg-[#242424] p-[2px] hover:bg-[#304678e6] md:bottom-[90px]"
                onClick={zoomToUserLocation}
            >
                <TbFocus2 className="m-[4px] text-white group-hover:text-white" size="30px" />
            </div>
        </div>
    );
};

export default function MapAndContentWrapper({
    mapboxKey,
    children,
}: {
    mapboxKey: string;
    children: React.ReactNode;
}) {
    const [mapOpen, setMapOpen] = useAtom(mapOpenAtom);
    const [showMap, setShowMap] = useState(false);
    const [, setMapboxKey] = useAtom(mapboxKeyAtom);
    const [triggerOpen, setTriggerOpen] = useAtom(triggerMapOpenAtom);
    const { windowWidth, windowHeight } = useWindowDimensions();
    const isMobile = windowWidth <= 768;

    let innerWidth = 0;
    if (typeof document !== "undefined") {
        innerWidth = document.documentElement.offsetWidth;
    }

    const contentWidth = isMobile ? (triggerOpen ? 0 : innerWidth) : triggerOpen ? 420 : innerWidth - 72;
    const mapWidth = isMobile ? innerWidth : innerWidth - 420 - 72;

    useEffect(() => {
        if (mapboxKey) {
            setMapboxKey(mapboxKey);
        }
    }, [mapboxKey, setMapboxKey]);

    const handleAnimationComplete = () => {
        // add a slight delay to the mapOpen state change to make the animation smoother
        setMapOpen(triggerOpen);
        if (triggerOpen) {
            setTimeout(() => {
                setShowMap(true);
            }, 500);
        } else {
            setShowMap(false);
        }
    };

    return (
        <div className="relative flex w-full flex-row overflow-hidden bg-[#2e4c6b]">
            <motion.div
                className="relative min-h-screen overflow-x-hidden bg-[#fbfbfb]"
                animate={{ width: contentWidth }}
                transition={{ duration: 0.5 }}
                onAnimationComplete={handleAnimationComplete}
                initial={false}
            >
                {children}
            </motion.div>

            {triggerOpen && (
                <motion.div
                    className="pointer-events-none absolute right-0 top-0 z-30 flex h-screen flex-col items-center justify-center"
                    animate={{ width: mapWidth }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    initial={{ width: 0 }}
                >
                    <motion.div
                        initial={{ opacity: 1 }}
                        animate={{ opacity: showMap ? 0 : 1 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="flex items-center justify-center"
                    >
                        <Image src="/images/earth-placeholder.png" alt="map-background" width={933} height={933} />
                    </motion.div>

                    {/* <Image src="/images/earth.png" alt="map-background" width={933} height={933} /> */}
                    {/* <div className="h-[800px] w-[800px] rounded-full bg-[#e0e0e0]"></div> */}
                </motion.div>
            )}

            {showMap && mapboxKey && (
                <>
                    <div className="relative" style={{ width: mapWidth, height: windowHeight + "px" }}></div>
                    <div className={"fixed right-0 z-30"} style={{ width: mapWidth, height: windowHeight + "px" }}>
                        <MapBox mapboxKey={mapboxKey} />
                    </div>
                </>
            )}

            {mapboxKey && (
                <div
                    className="group fixed bottom-[100px] right-6 z-[50] cursor-pointer rounded-full bg-[#242424] p-[2px] hover:bg-[#304678e6] md:bottom-[30px]"
                    onClick={() => {
                        setShowMap(false);
                        setTriggerOpen(!triggerOpen);
                    }}
                >
                    {mapOpen ? (
                        <AiOutlineRead className="m-[4px] text-white group-hover:text-white" size="30px" />
                    ) : (
                        <LiaGlobeAfricaSolid className="text-white group-hover:text-white" size="38px" />
                    )}
                </div>
            )}

            <ContentPreview />
        </div>
    );
}

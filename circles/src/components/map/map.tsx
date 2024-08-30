"use client";

import React from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AiOutlineRead } from "react-icons/ai";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { sidePanelWidth } from "../../app/constants";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import { useAtom } from "jotai";
import { mapboxKeyAtom, mapOpenAtom, displayedContentAtom } from "@/lib/data/atoms";
import MapMarker from "./markers";
import { isEqual } from "lodash"; // You might need to install lodash
import { motion } from "framer-motion";
import Image from "next/image";

const MapBox = ({ mapboxKey }: { mapboxKey: string }) => {
    const mapContainer = useRef(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [displayedContent] = useAtom(displayedContentAtom);
    const [lng, setLng] = useState(20);
    const [lat, setLat] = useState(20);
    const [zoom, setZoom] = useState(2.2);
    mapboxgl.accessToken = mapboxKey;

    const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());

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
                    root.render(<MapMarker picture={item.picture?.url} />);

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
    }, [displayedContent]);

    return <div ref={mapContainer} className="map-container z-10" style={{ width: "100%", height: "100%" }} />;
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
    const [triggerOpen, setTriggerOpen] = useState(false);
    const { windowWidth, windowHeight } = useWindowDimensions();

    let innerWidth = 0;
    if (typeof document !== "undefined") {
        innerWidth = document.documentElement.offsetWidth;
    }

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
                className="relative min-h-screen bg-white"
                animate={{ width: triggerOpen ? "420px" : windowWidth - 72 }}
                transition={{ duration: 0.5 }}
                // initial={{ width: innerWidth }}
                // style={{ width: windowWidth }}
                onAnimationComplete={handleAnimationComplete}
                initial={false}
            >
                {children}
            </motion.div>

            {triggerOpen && (
                <motion.div
                    className="pointer-events-none absolute right-0 top-0 z-20 flex h-screen flex-col items-center justify-center"
                    animate={{ width: innerWidth - 420 - 72 }}
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
                    <div
                        className="relative"
                        style={{ width: innerWidth - sidePanelWidth - 72 + "px", height: windowHeight + "px" }}
                    ></div>
                    <div
                        className={"fixed right-0"}
                        style={{ width: innerWidth - sidePanelWidth - 72 + "px", height: windowHeight + "px" }}
                    >
                        <MapBox mapboxKey={mapboxKey} />
                    </div>
                </>
            )}

            {mapboxKey && (
                <div
                    className="group fixed bottom-[10px] right-5 z-30 cursor-pointer rounded-full bg-[#242424] p-[2px] hover:bg-[#304678e6]"
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
        </div>
    );
}

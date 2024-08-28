"use client";

import React from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AiOutlineRead } from "react-icons/ai";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { sidePanelWidth, topBarHeight } from "../../app/constants";
import useWindowDimensions from "@/components/utils/use-window-dimensions";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import { useAtom } from "jotai";
import { mapboxKeyAtom, mapOpenAtom, displayedContentAtom } from "@/lib/data/atoms";
import MapMarker from "./markers";
import { isEqual } from "lodash"; // You might need to install lodash

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
            console.log("Map Container not available");
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
                    const markerElement = document.createElement("div");
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

export default function Map({ mapboxKey }: { mapboxKey: string }) {
    const [mapOpen, setMapOpen] = useAtom(mapOpenAtom);
    const [, setMapboxKey] = useAtom(mapboxKeyAtom);
    const { windowWidth, windowHeight } = useWindowDimensions();

    useEffect(() => {
        if (mapboxKey) {
            setMapboxKey(mapboxKey);
        }
    }, [mapboxKey, setMapboxKey]);

    if (!mapboxKey) return null;

    return (
        <>
            {mapOpen && (
                <>
                    <div
                        className="relative flex-grow-[1000]"
                        style={{ width: windowWidth - sidePanelWidth - 72 + "px", height: windowHeight + "px" }}
                    ></div>
                    <div
                        className={`fixed right-0`}
                        style={{ width: windowWidth - sidePanelWidth - 72 + "px", height: windowHeight + "px" }}
                    >
                        <MapBox mapboxKey={mapboxKey} />
                    </div>
                </>
            )}
            <div
                className="group fixed bottom-[10px] right-5 z-30 cursor-pointer rounded-full bg-[#242424] p-[2px] hover:bg-[#304678e6]"
                onClick={() => setMapOpen(!mapOpen)}
            >
                {mapOpen ? (
                    <AiOutlineRead className="m-[4px] text-white group-hover:text-white" size="30px" />
                ) : (
                    <LiaGlobeAfricaSolid className="text-white group-hover:text-white" size="38px" />
                )}
            </div>
        </>
    );
}

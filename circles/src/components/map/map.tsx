"use client";

import { useEffect, useRef, useState } from "react";
import { AiOutlineRead } from "react-icons/ai";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { sidePanelWidth, topBarHeight } from "../../app/constants";
import useWindowDimensions from "@/lib/use-window-dimensions";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax

const MapBox = ({ mapboxKey }: { mapboxKey: string }) => {
    const mapContainer = useRef(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [lng, setLng] = useState(20);
    const [lat, setLat] = useState(20);
    const [zoom, setZoom] = useState(2.2);
    mapboxgl.accessToken = mapboxKey;

    useEffect(() => {
        if (!mapContainer.current) {
            console.log("Map Container not available");
            return; // wait for map container to be available
        }
        if (map.current) return; // initialize map only once
        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [lng, lat],
            zoom: zoom,
        });
    }, [mapContainer, lat, lng, zoom]);

    return <div ref={mapContainer} className="map-container z-10" style={{ width: "100%", height: "100%" }} />;
};

export default function Map({ mapboxKey }: { mapboxKey: string }) {
    const [mapOpen, setMapOpen] = useState(false);
    const { windowWidth, windowHeight } = useWindowDimensions();

    if (!mapboxKey) return null;

    return (
        <>
            {mapOpen && (
                <div
                    className={`relative`}
                    style={{ width: windowWidth - sidePanelWidth + "px", height: windowHeight - topBarHeight + "px" }}
                >
                    <MapBox mapboxKey={mapboxKey} />
                </div>
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

"use client";

import { useEffect, useRef, useState } from "react";
import { AiOutlineRead } from "react-icons/ai";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { sidePanelWidth, topBarHeight } from "./constants";
import useWindowDimensions from "@/components/useWindowDimensions";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax

mapboxgl.accessToken = "pk.eyJ1IjoiZXhtYWtpbmEtYWRtaW4iLCJhIjoiY2t1cjJkOWJuMDB0MDJvbWYweWx5emR0dSJ9.elxjxO7DHA2UyXs0j7GTHA";

const MapBox = () => {
    const mapContainer = useRef(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [lng, setLng] = useState(20);
    const [lat, setLat] = useState(20);
    const [zoom, setZoom] = useState(2.2);

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

export default function Map() {
    const [mapOpen, setMapOpen] = useState(false);
    const { windowWidth, windowHeight } = useWindowDimensions();

    return (
        <>
            {mapOpen && (
                <div className={`relative`} style={{ width: windowWidth - sidePanelWidth + "px", height: windowHeight - topBarHeight + "px" }}>
                    <MapBox />
                </div>
            )}
            <div
                className="z-30 group fixed bottom-[10px] right-5 p-[2px] bg-[#242424] hover:bg-[#304678e6] rounded-full cursor-pointer"
                onClick={() => setMapOpen(!mapOpen)}
            >
                {mapOpen ? (
                    <AiOutlineRead className="text-white group-hover:text-white m-[4px]" size="30px" />
                ) : (
                    <LiaGlobeAfricaSolid className="text-white group-hover:text-white" size="38px" />
                )}
            </div>
        </>
    );
}

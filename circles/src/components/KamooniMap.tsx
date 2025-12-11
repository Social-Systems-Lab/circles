"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function KamooniMap() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        if (mapRef.current) return; // avoid double-init in StrictMode/dev

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [18.4233, -33.9189], // Cape Town-ish
            zoom: 9,
        });

        mapRef.current = map;

        map.on("load", () => {
            console.log("Mapbox map loaded");
        });

        map.on("error", (e) => {
            console.error("Mapbox error", e.error);
        });

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // IMPORTANT: visible height
    return (
        <div
            ref={containerRef}
            className="w-full"
            style={{ height: "400px" }}
        />
    );
}

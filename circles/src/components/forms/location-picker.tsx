"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { MapPin, Globe, Map as MapIcon, Building, Milestone } from "lucide-react";
import { PiCityLight } from "react-icons/pi";
import mapboxgl from "mapbox-gl";
import { cn } from "@/lib/utils";
import { mapboxKeyAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { LngLat, Location } from "@/models/models";

const precisionLevels = [
    { name: "Country", icon: Globe },
    { name: "Region", icon: MapIcon },
    { name: "City", icon: PiCityLight },
    { name: "Street", icon: Milestone },
    { name: "Exact", icon: MapPin },
];

type PrecisionLevel = 0 | 1 | 2 | 3 | 4;

interface LocationPickerProps {
    value: Location;
    onChange: (value: Location) => void;
}

const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange }) => {
    const map = useRef<mapboxgl.Map | null>(null);
    const mapContainer = useRef<HTMLDivElement | null>(null);
    const mapMarker = useRef<mapboxgl.Marker | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [precision, setPrecision] = useState<PrecisionLevel>(2);
    const [mapboxKey] = useAtom(mapboxKeyAtom);

    useEffect(() => {
        if (!mapboxKey || !mapContainer.current) return;
        if (map.current) return; // only initialize mapbox once

        mapboxgl.accessToken = mapboxKey;
        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center: value?.lngLat ?? [0, 0],
            zoom: 2,
        });

        // add marker
        const marker = new mapboxgl.Marker();
        marker.setLngLat(value?.lngLat ?? [0, 0]);
        marker.addTo(map.current);
        mapMarker.current = marker;
    });

    const updateLocation = async (lngLat: LngLat) => {
        if (!map.current || !mapMarker.current) return;

        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngLat.lng},${lngLat.lat}.json?access_token=${mapboxgl.accessToken}`,
        );
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const newLocation: Location = {
                precision,
                country: feature.context.find((c: any) => c.id.startsWith("country"))?.text,
                region: feature.context.find((c: any) => c.id.startsWith("region"))?.text,
                city: feature.context.find((c: any) => c.id.startsWith("place"))?.text,
                street: feature.text,
                lngLat: lngLat,
            };

            onChange(newLocation);

            mapMarker.current.setLngLat(lngLat);
            map.current.flyTo({ center: lngLat, zoom: 12 });
        }
    };

    useEffect(() => {
        onChange({ ...value, precision });
    }, [precision]);

    const handleSearch = async () => {
        if (!map) return;

        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${searchQuery}.json?access_token=${mapboxgl.accessToken}`,
        );
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center;
            updateLocation({ lng, lat });
        }
    };

    const handleUseCurrentLocation = () => {
        if (!map) return;

        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            updateLocation({ lng: longitude, lat: latitude });
        });
    };

    const getDisplayLocation = () => {
        if (!value) return "No location set";

        const parts = [];
        if (precision >= 0 && value.country) parts.push(value.country);
        if (precision >= 1 && value.region) parts.push(value.region);
        if (precision >= 2 && value.city) parts.push(value.city);
        if (precision >= 3 && value.street) parts.push(value.street);
        if (precision >= 4 && value.lngLat) {
            parts.push(`${value.lngLat.lat.toFixed(4)}, ${value.lngLat.lng.toFixed(4)}`);
        }
        return parts.length > 0 ? parts.join(", ") : "No location set";
    };

    return (
        <div className="space-y-4">
            <div className="flex space-x-2">
                <Input
                    type="text"
                    placeholder="Search for a location"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button type="button" onClick={handleSearch}>
                    Search
                </Button>
            </div>
            <Button type="button" onClick={handleUseCurrentLocation}>
                <MapPin className="mr-2 h-4 w-4" />
                Use Current Location
            </Button>
            <div className="h-[300px] w-full">
                <div ref={mapContainer} style={{ width: "100%", height: "100%" }}></div>
            </div>
            <div className="w-full max-w-sm space-y-4">
                <div className="space-y-2">
                    <Label>Location Precision</Label>
                    <Slider
                        min={0}
                        max={4}
                        step={1}
                        value={[precision]}
                        onValueChange={(value) => setPrecision(value[0] as PrecisionLevel)}
                        className="w-full"
                    />
                </div>
                <div className="flex justify-between px-1">
                    {precisionLevels.map((level, index) => {
                        const IconComponent = level.icon;
                        return (
                            <div
                                key={level.name}
                                className={cn(
                                    "text-center",
                                    index === precision ? "text-primary" : "text-muted-foreground",
                                )}
                            >
                                <IconComponent
                                    className={cn(
                                        "h-6 w-6",
                                        index === precision ? "scale-125 transition-transform" : "",
                                    )}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="flex flex-col">
                Precision Level: <span className="font-bold">{precisionLevels[precision].name}</span>
                Selected Location: <span className="font-bold">{getDisplayLocation()}</span>
            </div>
        </div>
    );
};

export default LocationPicker;

"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { MapPin, Globe, Map as MapIcon, Building, Milestone } from "lucide-react";
import { PiCityLight } from "react-icons/pi";
import mapboxgl from "mapbox-gl";
import { cn } from "@/lib/utils";
import { mapboxKeyAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { LngLat, Location } from "@/models/models";
import { AutoComplete, Option } from "@/components/ui/autocomplete";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export const precisionLevels = [
    { name: "Country", icon: Globe, zoom: 3 },
    { name: "Region", icon: MapIcon, zoom: 5 },
    { name: "City", icon: PiCityLight, zoom: 12 },
    { name: "Street", icon: Milestone, zoom: 15 },
    { name: "Exact", icon: MapPin, zoom: 18 },
];

type PrecisionLevel = 0 | 1 | 2 | 3 | 4;

interface LocationPickerProps {
    value?: Location;
    onChange: (value: Location) => void;
    compact?: boolean; // Add compact mode option
}

const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange, compact = false }) => {
    const map = useRef<mapboxgl.Map | null>(null);
    const mapContainer = useRef<HTMLDivElement | null>(null);
    const mapMarker = useRef<mapboxgl.Marker | null>(null);
    const [searchOptions, setSearchOptions] = useState<Option[]>([]);
    // Default to Exact precision (4), regardless of whether location is set
    const [precision, setPrecision] = useState<PrecisionLevel>((value?.precision as PrecisionLevel) ?? 4);
    const [mapboxKey] = useAtom(mapboxKeyAtom);
    const [isLoading, setIsLoading] = useState(false);
    const [autoCompleteValue, setAutoCompleteValue] = useState<Option>({
        value: value?.lngLat ? `${value.lngLat.lat},${value.lngLat.lng}` : "",
        label: "",
    });
    const [isLocationConfirmed, setIsLocationConfirmed] = useState(value?.lngLat ? true : false);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.LocationPicker.1");
        }
    }, []);

    useEffect(() => {
        if (!mapboxKey || !mapContainer.current) return;
        if (map?.current) return; // only initialize mapbox once

        mapboxgl.accessToken = mapboxKey;

        // Default to global view when no location is set
        const defaultCenter: [number, number] = [0, 20]; // Center on equator but slightly north for better world view
        const defaultZoom = 1; // Global view zoom level - 1 is the most zoomed out

        // Create the map with explicit defaults
        // Set two different zoom behaviors:
        // 1. For UI/slider - maintain precision at Exact (4) for user selection
        // 2. For map view - use zoom level 1 (global view) when no location set
        // This way we keep "Exact" precision selected but start with a zoomed out map
        const initialZoom = value?.lngLat ? precisionLevels[precision].zoom : 1;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center: value?.lngLat ?? defaultCenter,
            zoom: initialZoom,
            maxZoom: 18,
            minZoom: 0.5,
            trackResize: true,
        });

        // Log the initial zoom for debugging
        console.log("Initial map zoom:", value?.lngLat ? precisionLevels[precision].zoom : defaultZoom);

        // Create the marker but don't add it to the map yet if no location
        const marker = new mapboxgl.Marker();

        // If we have an initial location, set the marker and add it to map
        if (value?.lngLat) {
            marker.setLngLat(value.lngLat);
            marker.addTo(map.current);
        }

        // Store the marker reference for later use
        mapMarker.current = marker;

        // Make sure the map zoom is correct after load
        map.current.on("load", () => {
            const actualZoom = map.current?.getZoom() || 0;
            console.log("Map loaded with zoom:", actualZoom);

            // If the zoom is unexpectedly high and no location is set, reset it
            if (actualZoom > 5 && !value?.lngLat) {
                console.log("Correcting zoom to global view");
                map.current?.setZoom(1);
                map.current?.setCenter([0, 20]);
            }
        });
        mapMarker.current = marker;

        // Add click event listener to the map
        map.current.on("click", (e) => {
            // When a user clicks on the map, ensure the marker is added if it's the first click
            if (map.current && mapMarker.current && !mapMarker.current.getLngLat()) {
                // This is the first click, need to add the marker to the map
                mapMarker.current.setLngLat([e.lngLat.lng, e.lngLat.lat]);
                mapMarker.current.addTo(map.current);
            }

            updateLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat }, false);
            setIsLocationConfirmed(true);
        });

        return () => {
            mapMarker.current?.remove();
            map.current?.remove();
            map.current = null;
        };
    }, [mapboxKey]);

    useEffect(() => {
        // change mapbox zoom based on precision
        if (map.current) {
            map.current.setZoom(precisionLevels[precision].zoom);
        }
    }, [precision]);

    const updateLocation = async (lngLat: LngLat, flyTo: boolean) => {
        if (!map.current || !mapMarker.current) return;

        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngLat.lng},${lngLat.lat}.json?access_token=${mapboxgl.accessToken}`,
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const feature = data.features[0];

                // Try to safely get context data
                let country, region, city, street;
                if (feature.context) {
                    country = feature.context.find((c: any) => c.id.startsWith("country"))?.text;
                    region = feature.context.find((c: any) => c.id.startsWith("region"))?.text;
                    city = feature.context.find((c: any) => c.id.startsWith("place"))?.text;
                }
                street = feature.text;

                const newLocation: Location = {
                    precision,
                    country,
                    region,
                    city,
                    street,
                    lngLat: lngLat,
                };

                // Update the map marker position
                mapMarker.current.setLngLat(lngLat);

                // Make sure the marker is added to the map if it hasn't been yet
                if (!mapMarker.current.getElement().parentNode) {
                    mapMarker.current.addTo(map.current);
                }

                if (flyTo) {
                    map.current.flyTo({ center: lngLat, zoom: precisionLevels[precision].zoom });
                }

                // After map updates are done, update the location state
                onChange(newLocation);
            }
        } catch (error) {
            console.error("Error updating location:", error);
        }
    };

    // This effect updates the location's precision when the slider changes
    useEffect(() => {
        if (value && value.lngLat) {
            // Only update if we have an actual location and precision has changed
            if (value.precision !== precision) {
                const updatedValue = { ...value, precision };
                onChange(updatedValue);
            }

            // Always update the map view when precision changes
            if (map.current && mapMarker.current) {
                map.current.flyTo({ center: value.lngLat, zoom: precisionLevels[precision].zoom });
                mapMarker.current.setLngLat(value.lngLat);
            }
        }
    }, [precision, onChange]);

    const fetchSuggestions = useCallback(
        async (query: string) => {
            if (!query) {
                setSearchOptions([]);
                return;
            }

            setIsLoading(true);
            try {
                const types = ["country", "region", "place", "address"].slice(0, precision + 1);
                const response = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxKey}&autocomplete=true&types=${types.join(",")}`,
                );
                const data = await response.json();
                // validate response
                if (!data.features) {
                    console.error("Invalid response from mapbox:", data);
                    return;
                }

                const options: Option[] = data.features.map((feature: any) => ({
                    value: `${feature.center[1]},${feature.center[0]}`,
                    label: feature.place_name,
                }));
                setSearchOptions(options);
            } catch (error) {
                console.error("Error fetching suggestions:", error);
            } finally {
                setIsLoading(false);
            }
        },
        [mapboxKey, precision],
    );

    const handleSuggestionSelect = (option: Option) => {
        const [lat, lng] = option.value.split(",").map(Number);
        updateLocation({ lng, lat }, true);
        setIsLocationConfirmed(true);
    };

    const handleUseCurrentLocation = () => {
        if (!map) return;

        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            updateLocation({ lng: longitude, lat: latitude }, true);
            setIsLocationConfirmed(true);
        });
    };

    const getDisplayLocation = useCallback((location: Location | undefined, precisionLevel: PrecisionLevel) => {
        if (!location) return "";

        const parts = [];
        if (precisionLevel >= 3 && location.street) parts.push(location.street);
        if (precisionLevel >= 2 && location.city) parts.push(location.city);
        if (precisionLevel >= 1 && location.region) parts.push(location.region);
        if (precisionLevel >= 0 && location.country) parts.push(location.country);
        if (precisionLevel >= 4 && location.lngLat) {
            parts.push(`${location.lngLat.lat.toFixed(4)}, ${location.lngLat.lng.toFixed(4)}`);
        }

        return parts.length > 0 ? parts.join(", ") : "";
    }, []);

    // Update the autocomplete value when the location or precision changes
    const memoizedDisplayLocation = useMemo(
        () => getDisplayLocation(value, precision),
        [value, precision, getDisplayLocation],
    );

    useEffect(() => {
        setAutoCompleteValue({
            value: value?.lngLat ? `${value.lngLat.lat},${value.lngLat.lng}` : "",
            label: memoizedDisplayLocation,
        });
    }, [value?.lngLat, memoizedDisplayLocation]);

    const handleClearLocation = () => {
        onChange({ precision } as Location);
        setIsLocationConfirmed(false);
        setAutoCompleteValue({ value: "", label: "" });
    };

    return (
        <div className="space-y-4">
            <AutoComplete
                options={searchOptions}
                onValueChange={handleSuggestionSelect}
                value={autoCompleteValue}
                isLoading={isLoading}
                placeholder="Type or tap map to set location"
                emptyMessage="No results found"
                onSearch={fetchSuggestions}
                isLocationConfirmed={isLocationConfirmed}
            />
            <Button type="button" onClick={handleUseCurrentLocation}>
                <MapPin className="mr-2 h-4 w-4" />
                Use Current Location
            </Button>
            {/* Adjust map height based on compact mode */}
            <div className={`relative w-full ${compact ? "h-[200px]" : "h-[300px]"}`}>
                <div ref={mapContainer} style={{ width: "100%", height: "100%" }}></div>
            </div>

            {/* Only show precision controls if not in compact mode */}
            {!compact && (
                <>
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
                    </div>
                </>
            )}
        </div>
    );
};

export default LocationPicker;

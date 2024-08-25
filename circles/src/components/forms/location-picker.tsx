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

const precisionLevels = [
    { name: "Country", icon: Globe, zoom: 3 },
    { name: "Region", icon: MapIcon, zoom: 5 },
    { name: "City", icon: PiCityLight, zoom: 10 },
    { name: "Street", icon: Milestone, zoom: 15 },
    { name: "Exact", icon: MapPin, zoom: 18 },
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
    const [searchOptions, setSearchOptions] = useState<Option[]>([]);
    const [precision, setPrecision] = useState<PrecisionLevel>(4);
    const [mapboxKey] = useAtom(mapboxKeyAtom);
    const [isLoading, setIsLoading] = useState(false);
    const [autoCompleteValue, setAutoCompleteValue] = useState<Option>({
        value: value?.lngLat ? `${value.lngLat.lat},${value.lngLat.lng}` : "",
        label: "",
    });
    const [isLocationConfirmed, setIsLocationConfirmed] = useState(value?.lngLat ? true : false);

    useEffect(() => {
        if (!mapboxKey || !mapContainer.current) return;
        if (map.current) return; // only initialize mapbox once

        mapboxgl.accessToken = mapboxKey;
        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center: value?.lngLat ?? [0, 0],
            zoom: value?.lngLat ? precisionLevels[precision].zoom : 1,
        });

        // add marker
        const marker = new mapboxgl.Marker();
        marker.setLngLat(value?.lngLat ?? [0, 0]);
        marker.addTo(map.current);
        mapMarker.current = marker;

        // Add click event listener to the map
        map.current.on("click", (e) => {
            updateLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat }, false);
            setIsLocationConfirmed(true);
        });
    }, [mapboxKey, precision]);

    const updateLocation = async (lngLat: LngLat, flyTo: boolean) => {
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
            if (flyTo) {
                map.current.flyTo({ center: lngLat, zoom: precisionLevels[precision].zoom });
            }
        }
    };

    useEffect(() => {
        if (value) {
            const updatedValue = { ...value, precision };
            onChange(updatedValue);
            if (map.current && mapMarker.current && value.lngLat) {
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

    useEffect(() => {
        setAutoCompleteValue({
            value: value?.lngLat ? `${value.lngLat.lat},${value.lngLat.lng}` : "",
            label: getDisplayLocation(value, precision),
        });
    }, [value, precision, getDisplayLocation]);

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
                placeholder="Type location or click on map to set location"
                emptyMessage="No results found"
                onSearch={fetchSuggestions}
                isLocationConfirmed={isLocationConfirmed}
            />
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
            </div>
        </div>
    );
};

export default LocationPicker;

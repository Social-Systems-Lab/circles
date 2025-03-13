"use client";

import { useEffect } from "react";
import { useAtom } from "jotai";
import { mapboxKeyAtom } from "@/lib/data/atoms";

export function MapboxInitializer({ mapboxKey }: { mapboxKey?: string }) {
    const [, setMapboxKey] = useAtom(mapboxKeyAtom);

    useEffect(() => {
        if (mapboxKey) {
            setMapboxKey(mapboxKey);
        }
    }, [mapboxKey, setMapboxKey]);

    return null;
}

"use client";

import { useEffect, useState } from "react";

export function useClientMediaQuery(query: string) {
    const [matches, setMatches] = useState<boolean | null>(null);

    useEffect(() => {
        const mediaQueryList = window.matchMedia(query);

        const handleMatchChange = (e: any) => {
            setMatches(e.matches);
        };

        mediaQueryList.addEventListener("change", handleMatchChange);
        setMatches(mediaQueryList.matches);

        return () => {
            mediaQueryList.removeEventListener("change", handleMatchChange);
        };
    }, [query]);

    return matches;
}

export function useIsMobile() {
    const [matches, setMatches] = useState<boolean | null>(null);

    useEffect(() => {
        const mediaQueryList = window.matchMedia("(max-width: 768px)");

        const handleMatchChange = (e: any) => {
            setMatches(e.matches);
        };

        mediaQueryList.addEventListener("change", handleMatchChange);
        setMatches(mediaQueryList.matches);

        return () => {
            mediaQueryList.removeEventListener("change", handleMatchChange);
        };
    }, []);

    return matches;
}

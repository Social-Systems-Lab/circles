"use client";

import { useState, useEffect } from "react";

function getWindowDimensions() {
    if (typeof window === "undefined") {
        return { windowWidth: 0, windowHeight: 0 };
    }

    const { innerWidth: windowWidth, innerHeight: windowHeight } = window;
    return {
        windowWidth,
        windowHeight,
    };
}

export default function useWindowDimensions() {
    const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions());

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        function handleResize() {
            setWindowDimensions(getWindowDimensions());
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return windowDimensions;
}

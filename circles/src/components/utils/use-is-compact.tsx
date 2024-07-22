"use client";

import { useIsMobile } from "./use-is-mobile";
import { useAtom } from "jotai";
import { mapOpenAtom } from "@/lib/data/atoms";

export function useIsCompact() {
    const isMobile = useIsMobile();
    const [isMapOpen] = useAtom(mapOpenAtom);

    return isMobile || isMapOpen;
}

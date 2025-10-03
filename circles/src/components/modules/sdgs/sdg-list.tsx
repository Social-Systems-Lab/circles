"use client";
import React from "react";
import { Cause as SDG } from "@/models/models";
import { ItemGrid } from "@/components/circle-wizard/item-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SdgListProps {
    sdgs: SDG[];
    selectedSdgs: SDG[];
    onToggle: (sdg: SDG) => void;
    gridCols?: string;
    className?: string;
    causeCounts?: Record<string, number>;
}

export const SdgList: React.FC<SdgListProps> = ({ sdgs, selectedSdgs, onToggle, gridCols, className, causeCounts }) => {
    return (
        <ScrollArea className={cn("h-60", className)}>
            <ItemGrid
                items={sdgs}
                selectedItems={selectedSdgs}
                onToggle={onToggle}
                isCause={true}
                gridCols={gridCols}
                causeCounts={causeCounts}
            />
        </ScrollArea>
    );
};

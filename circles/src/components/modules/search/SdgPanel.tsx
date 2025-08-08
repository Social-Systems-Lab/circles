"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ItemGrid } from "@/components/circle-wizard/item-card";
import { Cause as SDG } from "@/models/models";

import { cn } from "@/lib/utils";

interface SdgPanelProps {
    visibleSdgs: SDG[];
    selectedSdgs: SDG[];
    onToggle: (sdg: SDG) => void;
    search: string;
    setSearch: (value: string) => void;
    className?: string;
}

export const SdgPanel: React.FC<SdgPanelProps> = ({
    visibleSdgs,
    selectedSdgs,
    onToggle,
    search,
    setSearch,
    className,
}) => {
    return (
        <div className={cn("p-1", className)}>
            <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search SDGs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 text-xs"
                />
            </div>
            <ScrollArea className="h-60">
                <ItemGrid items={visibleSdgs} selectedItems={selectedSdgs} onToggle={onToggle} isCause={true} />
            </ScrollArea>
        </div>
    );
};

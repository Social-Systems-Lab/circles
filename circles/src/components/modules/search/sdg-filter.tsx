"use client";

import React, { useState, useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { sdgs } from "@/lib/data/sdgs";
import { Cause as SDG } from "@/models/models";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ItemGrid } from "@/components/circle-wizard/item-card";
import Image from "next/image";

interface SdgFilterProps {
    selectedSdgs: SDG[];
    onSelectionChange: (sdgs: SDG[]) => void;
}

const SdgFilter: React.FC<SdgFilterProps> = ({ selectedSdgs, onSelectionChange }) => {
    const [search, setSearch] = useState("");

    const visibleSdgs = useMemo(() => {
        if (search) {
            return sdgs.filter(
                (sdg) =>
                    sdg.name.toLowerCase().includes(search.toLowerCase()) ||
                    sdg.description.toLowerCase().includes(search.toLowerCase()),
            );
        }
        return sdgs;
    }, [search]);

    const handleSdgToggle = (sdg: SDG) => {
        const isSelected = selectedSdgs.some((s) => s.handle === sdg.handle);
        if (isSelected) {
            onSelectionChange(selectedSdgs.filter((s) => s.handle !== sdg.handle));
        } else {
            onSelectionChange([...selectedSdgs, sdg]);
        }
    };

    const renderHeader = () => {
        if (selectedSdgs.length === 0) {
            return "All SDG's";
        }
        if (selectedSdgs.length > 0) {
            return (
                <div className="flex items-center">
                    <span>Selected ({selectedSdgs.length})</span>
                    <div className="ml-2 flex -space-x-2">
                        {selectedSdgs.slice(0, 3).map((sdg) => (
                            <Image
                                key={sdg.handle}
                                src={sdg.picture?.url ?? "/images/default-picture.png"}
                                alt={sdg.name}
                                width={24}
                                height={24}
                                className="h-6 w-6 rounded-full border-2 border-white object-cover"
                            />
                        ))}
                    </div>
                </div>
            );
        }
    };

    return (
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="sdgs">
                <AccordionTrigger className="text-sm font-medium">{renderHeader()}</AccordionTrigger>
                <AccordionContent>
                    <div className="p-1">
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
                            <ItemGrid
                                items={visibleSdgs}
                                selectedItems={selectedSdgs}
                                onToggle={handleSdgToggle}
                                isCause={true}
                            />
                        </ScrollArea>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

export default SdgFilter;

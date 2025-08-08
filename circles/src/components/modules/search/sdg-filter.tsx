"use client";

import React, { useState, useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sdgs } from "@/lib/data/sdgs";
import { Cause as SDG } from "@/models/models";
import { SdgPanel } from "./SdgPanel";
import Image from "next/image";

interface SdgFilterProps {
    selectedSdgs: SDG[];
    onSelectionChange: (sdgs: SDG[]) => void;
    displayAs?: "inline" | "popover";
    trigger?: React.ReactNode;
}

const SdgFilter: React.FC<SdgFilterProps> = ({ selectedSdgs, onSelectionChange, displayAs = "inline", trigger }) => {
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);

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

    const panel = (
        <SdgPanel
            visibleSdgs={visibleSdgs}
            selectedSdgs={selectedSdgs}
            onToggle={handleSdgToggle}
            search={search}
            setSearch={setSearch}
        />
    );

    if (displayAs === "popover") {
        return (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                <PopoverContent className="w-80">{panel}</PopoverContent>
            </Popover>
        );
    }

    return (
        <Accordion
            type="single"
            collapsible
            className="w-full"
            value={isOpen ? "sdgs" : ""}
            onValueChange={(value) => setIsOpen(value === "sdgs")}
        >
            <AccordionItem value="sdgs" className="border-none">
                <AccordionTrigger onClick={() => setIsOpen(!isOpen)} className="text-sm font-medium">
                    {trigger || renderHeader()}
                </AccordionTrigger>
                <AccordionContent>{panel}</AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

export default SdgFilter;

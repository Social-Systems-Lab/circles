"use client";

import { sdgs } from "@/lib/data/sdgs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Cause as SDG } from "@/models/models";
import Image from "next/image";
import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));

interface SdgListProps {
    sdgHandles: string[];
    className?: string;
}

export default function SdgList({ sdgHandles, className }: SdgListProps) {
    const selectedSdgs = sdgHandles.map((handle) => sdgMap.get(handle)).filter(Boolean) as SDG[];
    const [open, setOpen] = useState(false);

    const handleMouseEnter = () => {
        setOpen(true);
    };

    const handleMouseLeave = () => {
        setOpen(false);
    };

    if (selectedSdgs.length === 0) {
        return null;
    }

    return (
        <div className={`grid grid-cols-3 gap-2 ${className}`}>
            {selectedSdgs.map((sdg) => (
                <div key={sdg.handle} className="aspect-square overflow-hidden rounded-lg">
                    <Image
                        src={sdg.picture?.url ?? "/images/default-picture.png"}
                        alt={sdg.name}
                        width={100}
                        height={100}
                        className="h-full w-full object-cover"
                    />
                </div>
            ))}
        </div>
    );
}

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
                <HoverCard key={sdg.handle}>
                    <HoverCardTrigger>
                        <div className="aspect-square overflow-hidden rounded-lg">
                            <Image
                                src={sdg.picture?.url ?? "/images/default-picture.png"}
                                alt={sdg.name}
                                width={100}
                                height={100}
                                className="h-full w-full object-cover"
                            />
                        </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="formatted">
                        <h3 className="font-bold">{sdg.name}</h3>
                        <p>{sdg.description}</p>
                    </HoverCardContent>
                </HoverCard>
            ))}
        </div>
    );
}

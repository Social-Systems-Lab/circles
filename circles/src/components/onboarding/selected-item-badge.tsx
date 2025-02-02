"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "../utils/use-is-mobile";

type SelectedItemBadgeProps = {
    item: { name: string };
    onRemove: (item: any) => void;
};

const SelectedItemBadge = ({ item, onRemove }: SelectedItemBadgeProps) => {
    const isMobile = useIsMobile();

    return (
        <Badge
            className={`mb-2 mr-2 flex items-center ${
                isMobile ? "bg-[#66a5ff] px-2 py-1 text-xs" : "bg-[#66a5ff] pl-4 pr-2 text-sm"
            }`}
        >
            {item.name}
            <Button
                variant="ghost"
                size="sm"
                className={`ml-1 p-0 ${isMobile ? "h-4 w-4" : "h-5 w-5"}`}
                onClick={() => onRemove(item)}
            >
                <X className={isMobile ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
        </Badge>
    );
};

export default SelectedItemBadge;

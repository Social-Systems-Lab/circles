"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type SelectedItemBadgeProps = {
    item: { name: string };
    onRemove: (item: any) => void;
};
const SelectedItemBadge = ({ item, onRemove }: SelectedItemBadgeProps) => (
    <Badge className="mb-2 mr-2 bg-[#66a5ff] pl-4 pr-2">
        {item.name}
        <Button variant="ghost" size="sm" className="ml-2  p-0" onClick={() => onRemove(item)}>
            <X className="h-4 w-4" />
        </Button>
    </Badge>
);

export default SelectedItemBadge;

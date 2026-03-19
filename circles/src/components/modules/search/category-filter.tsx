"use client";

import React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Use ToggleGroup
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge"; // Import Badge for count display
import { Users, User, Calendar, Hammer, Search } from "lucide-react";

export interface CategoryFilterProps {
    categories: string[]; // All available categories (e.g., ['circles', 'projects', 'users'])
    categoryCounts: { [key: string]: number }; // Counts for each category
    selectedCategory: string | null; // Single selected category or null
    onSelectionChange: (selected: string | null) => void; // Callback for single selection
    hasSearched: boolean;
    displayLabelMap?: { [key: string]: string }; // Optional mapping for presentation labels
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
    categories,
    categoryCounts,
    selectedCategory,
    onSelectionChange,
    hasSearched,
    displayLabelMap,
}) => {
    const iconMap: Record<string, React.ReactNode> = {
        all: <Search className="h-4 w-4" />,
        communities: <Users className="h-4 w-4" />,
        users: <User className="h-4 w-4" />,
        events: <Calendar className="h-4 w-4" />,
        projects: <Hammer className="h-4 w-4" />,
    };

    // Handle ToggleGroup value change
    const handleValueChange = (value: string) => {
        // ToggleGroup returns the value of the selected item, or "" if deselected
        onSelectionChange(value && value !== "all" ? value : null); // "all" maps to no specific type filter
    };

    return (
        <ToggleGroup
            type="single"
            value={selectedCategory ?? "all"}
            onValueChange={handleValueChange}
            className="flex flex-nowrap items-center gap-2 whitespace-nowrap"
        >
            {categories.map((category) => (
                <ToggleGroupItem
                    key={category}
                    value={category} // Value used for selection state
                    variant="outline"
                    size="sm"
                    className={cn(
                        "flex h-auto min-w-[112px] flex-shrink-0 items-center justify-center gap-2 rounded-full bg-white px-[16px] py-[5px] text-sm capitalize leading-none shadow-sm",
                        "data-[state=on]:bg-[#9cb5f7] data-[state=on]:text-primary",
                        "hover:bg-white",
                    )}
                    aria-label={`Filter by ${displayLabelMap?.[category] ?? category}`}
                >
                    <span className="text-gray-600">{iconMap[category]}</span>
                    <span>
                        {displayLabelMap?.[category] ??
                            (category === "communities" ? "circles" : category)}
                    </span>
                    {hasSearched && (
                        <Badge variant="secondary" className="ml-2 rounded-full px-1.5 py-[2px] text-[10px]">
                            {categoryCounts[category] ?? 0}
                        </Badge>
                    )}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
};

export default CategoryFilter;

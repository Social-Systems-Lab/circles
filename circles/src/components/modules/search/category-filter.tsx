"use client";

import React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Use ToggleGroup
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge"; // Import Badge for count display

interface CategoryFilterProps {
    categories: string[]; // All available categories (e.g., ['circles', 'projects', 'users'])
    categoryCounts: { [key: string]: number }; // Counts for each category
    selectedCategory: string | null; // Single selected category or null
    onSelectionChange: (selected: string | null) => void; // Callback for single selection
    hasSearched: boolean;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
    categories,
    categoryCounts,
    selectedCategory,
    onSelectionChange,
    hasSearched,
}) => {
    // Handle ToggleGroup value change
    const handleValueChange = (value: string) => {
        // ToggleGroup returns the value of the selected item, or "" if deselected
        onSelectionChange(value || null); // Pass the selected value or null if empty string (deselected)
    };

    return (
        <ToggleGroup
            type="single"
            value={selectedCategory ?? ""} // Provide empty string if null for controlled component
            onValueChange={handleValueChange}
            className="flex flex-wrap items-center gap-2"
        >
            {categories.map((category) => (
                <ToggleGroupItem
                    key={category}
                    value={category} // Value used for selection state
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-auto rounded-full border px-3 py-1 text-xs capitalize", // Chip-like styling, allow height adjust
                        "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground", // Styling when selected
                        "hover:bg-accent hover:text-accent-foreground", // Hover styling
                    )}
                    aria-label={`Filter by ${category}`}
                >
                    {category}
                    {hasSearched && (
                        <Badge variant="secondary" className="ml-1.5 rounded-full px-1.5 py-0 text-xs">
                            {categoryCounts[category] ?? 0}
                        </Badge>
                    )}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
};

export default CategoryFilter;

"use client";

import React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Use ToggleGroup
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge"; // Import Badge for count display
import { Users, User, Calendar } from "lucide-react";

interface CategoryFilterProps {
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
        communities: <Users className="h-4 w-4" />,
        users: <User className="h-4 w-4" />,
        events: <Calendar className="h-4 w-4" />,
    };

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
            className="flex items-center gap-2"
        >
            {categories.map((category) => (
                <ToggleGroupItem
                    key={category}
                    value={category} // Value used for selection state
                    variant="outline"
                    size="sm"
                    className={cn(
                        "flex h-auto items-center gap-2 rounded-full border bg-white px-5 py-1.5 text-sm capitalize shadow-sm",
                        "data-[state=on]:border-primary data-[state=on]:bg-white data-[state=on]:text-primary",
                        "hover:bg-white"
                    )}
                    aria-label={`Filter by ${displayLabelMap?.[category] ?? category}`}
                >
                    <span className="text-gray-600">{iconMap[category]}</span>
                    <span>{displayLabelMap?.[category] ?? category}</span>
                    {hasSearched && (
                        <Badge variant="secondary" className="ml-2 rounded-full px-1.5 py-0 text-[10px]">
                            {categoryCounts[category] ?? 0}
                        </Badge>
                    )}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
};

export default CategoryFilter;

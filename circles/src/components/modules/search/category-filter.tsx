"use client";

import React from "react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
    categories: string[]; // All available categories
    selectedCategories: string[];
    onSelectionChange: (selected: string[]) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ categories, selectedCategories, onSelectionChange }) => {
    const handleToggle = (category: string, pressed: boolean) => {
        // Added explicit boolean type
        let newSelection: string[];
        if (pressed) {
            // Add category if not already present
            newSelection = selectedCategories.includes(category)
                ? selectedCategories
                : [...selectedCategories, category];
        } else {
            // Remove category
            newSelection = selectedCategories.filter((c) => c !== category);
        }
        onSelectionChange(newSelection);
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {categories.map((category) => (
                <Toggle
                    key={category}
                    pressed={selectedCategories.includes(category)}
                    onPressedChange={(pressed: boolean) => handleToggle(category, pressed)} // Explicitly type 'pressed' in callback
                    variant="outline"
                    size="sm"
                    className={cn(
                        "rounded-full border px-3 py-1 text-xs capitalize", // Chip-like styling
                        "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground", // Styling when selected
                        "hover:bg-accent hover:text-accent-foreground", // Hover styling
                    )}
                    aria-label={`Toggle ${category}`}
                >
                    {category}
                </Toggle>
            ))}
        </div>
    );
};

export default CategoryFilter;

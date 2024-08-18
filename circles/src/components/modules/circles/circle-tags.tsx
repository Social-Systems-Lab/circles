import React from "react";
import { Circle } from "@/models/models";

interface CircleTagsProps {
    circle: Circle;
    userInterests?: string[]; // Assuming userInterests is an array of strings
    showAll?: boolean;
    isCompact?: boolean;
}

export const CircleTags: React.FC<CircleTagsProps> = ({
    circle,
    userInterests,
    showAll = false,
    isCompact = false,
}) => {
    const isOverlap = (tag: string) => {
        return userInterests?.includes(tag);
    };

    const tagColor = (tag: string) => {
        const overlap = isOverlap(tag);
        return overlap ? "bg-[#89a0dd]" : "bg-[#89a0dd]";
    };

    const hoverColor = (tag: string) => {
        const overlap = isOverlap(tag);
        return overlap ? "hover:bg-green-400" : "hover:bg-blue-400";
    };

    const handleTagClick = (tag: string) => {
        // Add your logic here to navigate or do something when a tag is clicked
        // Example: router.push(`/tags/${tag}`);
        console.log(`Tag clicked: ${tag}`);
    };

    if (!circle.interests || circle.interests.length === 0) {
        return <div></div>;
    }

    return (
        <div className={`mt-2 flex flex-wrap justify-center ${isCompact ? "gap-1" : "gap-2"}`}>
            {circle.interests.slice(0, showAll ? circle.interests.length : 2).map((tag) => (
                <span
                    key={tag}
                    className={`cursor-pointer rounded-full  text-white ${isCompact ? "px-[7px] py-[3px] text-xs" : "px-2 py-1 text-sm font-semibold"} ${tagColor(tag)} ${hoverColor(tag)}`}
                    onClick={() => handleTagClick(tag)}
                >
                    {tag}
                </span>
            ))}
        </div>
    );
};

export default CircleTags;

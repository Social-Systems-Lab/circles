import React from "react";

interface CircleTagsProps {
    tags?: string[];
    showAll?: boolean;
    isCompact?: boolean;
}

export const CircleTags: React.FC<CircleTagsProps> = ({ tags, showAll = false, isCompact = false }) => {
    const handleTagClick = (tag: string) => {
        // Add your logic here to navigate or do something when a tag is clicked
        // Example: router.push(`/tags/${tag}`);
        console.log(`Tag clicked: ${tag}`);
    };

    if (!tags || tags.length === 0) {
        return <div></div>;
    }

    return (
        <div className={`mt-2 flex flex-wrap ${isCompact ? "gap-1" : "gap-2"}`}>
            {tags.slice(0, showAll ? tags.length : 2).map((tag) => (
                <span
                    key={tag}
                    className={`cursor-pointer rounded-full  text-white ${isCompact ? "px-[7px] py-[3px] text-xs" : "px-2 py-1 text-sm font-semibold"} bg-[#89a0dd] hover:bg-blue-400`}
                    onClick={() => handleTagClick(tag)}
                >
                    {tag}
                </span>
            ))}
        </div>
    );
};

export default CircleTags;

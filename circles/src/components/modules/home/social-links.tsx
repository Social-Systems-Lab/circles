"use client";

import React from "react";
import { Circle } from "@/models/models";
import { socialPlatforms } from "@/lib/data/social";

interface SocialLinksProps {
    circle: Circle;
}

const iconMap: { [key: string]: React.ElementType } = socialPlatforms.reduce(
    (acc, { handle, icon }) => ({ ...acc, [handle]: icon }),
    {},
);

export default function SocialLinks({ circle }: SocialLinksProps) {
    if (!circle.socialLinks || circle.socialLinks.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-row gap-4">
            {circle.socialLinks.map((link) => {
                const Icon = iconMap[link.platform.toLowerCase()];
                if (!Icon) {
                    return null;
                }
                return (
                    <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer">
                        <Icon className="h-6 w-6 text-gray-500 hover:text-gray-700" />
                    </a>
                );
            })}
        </div>
    );
}

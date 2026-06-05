"use client";

import React from "react";
import { Circle } from "@/models/models";
import { socialPlatforms } from "@/lib/data/social";
import { sanitizeSocialLinks } from "@/lib/utils/social-links";

interface SocialLinksProps {
    circle: Circle;
}

const iconMap: { [key: string]: React.ElementType } = socialPlatforms.reduce(
    (acc, { handle, icon }) => ({ ...acc, [handle]: icon }),
    {},
);

export default function SocialLinks({ circle }: SocialLinksProps) {
    const socialLinks = sanitizeSocialLinks(circle.socialLinks);

    if (socialLinks.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-row gap-4">
            {socialLinks.map((link) => {
                const Icon = iconMap[link.platform];
                if (!Icon) {
                    return null;
                }
                return (
                    <a key={`${link.platform}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer">
                        <Icon className="h-6 w-6 text-gray-500 hover:text-gray-700" />
                    </a>
                );
            })}
        </div>
    );
}

"use client";

import React from "react";
import { Circle } from "@/models/models";
import { MapPin, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

import CircleTags from "@/components/modules/circles/circle-tags";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { useIsCompact } from "@/components/utils/use-is-compact";

// Helper mappings for quick lookup
const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));
const skillMap = new Map(skills.map((s) => [s.handle, s]));

interface AboutPageProps {
    circle: Circle;
}

export const AboutPage: React.FC<AboutPageProps> = ({ circle }) => {
    const isCompact = useIsCompact();

    // Check if there is any content to display
    const hasContent =
        !!circle.description ||
        !!circle.mission ||
        !!(circle.location && (circle.location.city || circle.location.region || circle.location.country)) ||
        !!(circle.causes && circle.causes.length > 0) ||
        !!(circle.skills && circle.skills.length > 0);

    if (!hasContent) {
        return (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-8 text-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-700">No Information Yet</h2>
                    <p className="mt-2 text-gray-500">This community hasn&apos;t shared any details yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="custom-scrollbar h-full space-y-6 overflow-y-auto rounded-lg bg-white p-6">
            {/* Mission and Description */}
            <div className="space-y-4">
                {circle.mission && (
                    <div className="relative rounded-lg border bg-gray-50 p-4 pl-10 shadow-sm">
                        <Quote className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <p className="text-lg italic text-gray-800">{circle.mission}</p>
                    </div>
                )}
                {circle.description && (
                    <div className="prose prose-lg max-w-none text-gray-700">
                        <p>{circle.description}</p>
                    </div>
                )}
            </div>

            {/* Rich Content */}
            {circle.content && (
                <div className="prose prose-lg max-w-none rounded-lg border bg-gray-50/50 p-4 shadow-sm"></div>
            )}

            {/* Tags */}
            {circle.interests && circle.interests.length > 0 && (
                <div className="w-full">
                    <h3 className="mb-3 text-xl font-semibold text-gray-800">Tags</h3>
                    <CircleTags tags={circle.interests} />
                </div>
            )}

            {/* Details Grid */}
            <div className={`grid grid-cols-1 gap-6 ${isCompact ? "" : "md:grid-cols-2"}`}>
                {/* Location */}
                {circle.location && (circle.location.city || circle.location.region || circle.location.country) && (
                    <div className="w-full">
                        <h3 className="mb-3 text-xl font-semibold text-gray-800">Location</h3>
                        <div className="flex items-center text-lg text-gray-700">
                            <MapPin className="mr-2 h-6 w-6 flex-shrink-0 text-gray-500" />
                            <span>
                                {[circle.location.city, circle.location.region, circle.location.country]
                                    .filter(Boolean)
                                    .join(", ")}
                            </span>
                        </div>
                    </div>
                )}

                {/* SDGs */}
                {circle.causes && circle.causes.length > 0 && (
                    <div className="mb-6 w-full">
                        <h3 className="mb-3 text-xl font-semibold text-gray-800">
                            Sustainable Development Goals (SDGs)
                        </h3>
                        <div className="flex flex-wrap items-center gap-2">
                            {circle.causes.map((handle) => {
                                const sdg = sdgMap.get(handle);
                                if (!sdg) return null;
                                return (
                                    <Badge
                                        key={handle}
                                        variant="outline"
                                        className="flex items-center gap-2 rounded-full border-gray-300 px-3 py-1.5"
                                    >
                                        <Image
                                            src={sdg.picture.url}
                                            alt=""
                                            width={20}
                                            height={20}
                                            className="h-5 w-5 rounded-full object-cover"
                                        />
                                        <span className="text-sm font-medium">{sdg.name}</span>{" "}
                                        {/* Increased text size */}
                                    </Badge>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Skills/Needs */}
                {circle.skills && circle.skills.length > 0 && (
                    <div className="w-full">
                        <h3 className="mb-3 text-xl font-semibold text-gray-800">
                            {circle.circleType === "user" ? "Skills" : "Needs"}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2">
                            {circle.skills.map((handle) => {
                                const skill = skillMap.get(handle);
                                if (!skill) return null;
                                return (
                                    <Badge
                                        key={handle}
                                        variant="outline"
                                        className="flex items-center gap-2 rounded-full border-gray-300 px-3 py-1.5"
                                    >
                                        <Image
                                            src={skill.picture.url}
                                            alt=""
                                            width={20}
                                            height={20}
                                            className="h-5 w-5 rounded-full object-cover"
                                        />
                                        <span className="text-sm font-medium">{skill.name}</span>{" "}
                                        {/* Increased text size */}
                                    </Badge>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

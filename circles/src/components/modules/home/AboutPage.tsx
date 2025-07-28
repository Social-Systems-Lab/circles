"use client";

import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Quote } from "lucide-react";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import CircleTags from "@/components/modules/circles/circle-tags";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { useIsCompact } from "@/components/utils/use-is-compact";
import RichText from "../feeds/RichText";
import SdgList from "../sdgs/SdgList";

// Helper mappings for quick lookup
const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));
const skillMap = new Map(skills.map((s) => [s.handle, s]));

interface AboutPageProps {
    circle: Circle;
}

export default function AboutPage({ circle }: AboutPageProps) {
    const isCompact = useIsCompact();

    // Check if sidebar has any content
    const hasSidebarContent =
        !!circle.mission ||
        !!(circle.location && (circle.location.city || circle.location.region || circle.location.country)) ||
        !!(circle.causes && circle.causes.length > 0) ||
        !!(circle.skills && circle.skills.length > 0);

    const hasMainContent = !!circle.content || !!circle.description;

    return (
        <div className="formatted mx-auto max-w-[1100px] px-0 py-0 md:px-4 md:py-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* --- Main Content Column --- */}
                {/* Adjust column span based on sidebar visibility */}
                <div className={hasSidebarContent ? "md:col-span-2" : "md:col-span-3"}>
                    <div className={`bg-white p-6 ${isCompact ? "rounded-none" : "rounded-[15px] border-0 shadow-lg"}`}>
                        {/* Main Content */}
                        {hasMainContent ? (
                            <>
                                <h1 className="my-4">About</h1>
                                {circle.content ? (
                                    <RichText content={circle.content} />
                                ) : (
                                    <p className="mb-6 text-base">{circle.description}</p>
                                )}
                            </>
                        ) : (
                            // Default text if no content or description
                            <>
                                <h1 className="my-4">About</h1>
                                <p className="mb-6 text-base text-muted-foreground">
                                    This circle hasn&apos;t added a description yet.
                                </p>
                            </>
                        )}
                    </div>
                </div>
                {/* --- Sidebar Column (Conditionally Rendered) --- */}
                {hasSidebarContent && (
                    <div className="md:col-span-1">
                        <div
                            className={`flex flex-col items-center bg-white p-6
                        ${isCompact ? "rounded-none" : "rounded-[15px] border-0 bg-muted/20 shadow-lg"}
                        `}
                        >
                            {/* Mission */}
                            {circle.mission && (
                                <div className="mb-6 flex w-full flex-col text-sm text-muted-foreground">
                                    {" "}
                                    {/* Increased mb */}
                                    <div className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
                                        Mission
                                    </div>
                                    <div className="text-[15px] text-foreground">{circle.mission}</div>{" "}
                                    {/* Increased text size */}
                                </div>
                            )}

                            {/* Location */}
                            {circle.location &&
                                (circle.location.city || circle.location.region || circle.location.country) && (
                                    <div className="mb-6 flex w-full flex-col text-sm text-muted-foreground">
                                        {" "}
                                        {/* Increased mb */}
                                        <div className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
                                            Location
                                        </div>
                                        <div className="flex flex-row items-center text-foreground">
                                            {" "}
                                            {/* Added text-foreground */}
                                            <MapPin className="mr-1.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />{" "}
                                            {/* Increased icon size & color */}
                                            <span className="text-[15px]">
                                                {" "}
                                                {/* Increased text size */}
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
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">SDGs</div>
                                    <SdgList sdgHandles={circle.causes} className="grid-cols-4" />
                                </div>
                            )}

                            {/* Skills/Needs */}
                            {/* {circle.skills && circle.skills.length > 0 && (
                                <div className="w-full">
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        {" "}
                                        {circle.circleType === "user" ? "Skills" : "Needs"}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {circle.skills.map((handle) => {
                                            const skill = skillMap.get(handle);
                                            if (!skill) return null;
                                            return (
                                                <Badge
                                                    key={handle}
                                                    variant="outline"
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5" // Increased padding
                                                >
                                                    <Image
                                                        src={skill.picture.url}
                                                        alt=""
                                                        width={20} // Increased size
                                                        height={20} // Increased size
                                                        className="h-5 w-5 rounded-full object-cover" // Increased size
                                                    />
                                                    <span className="text-sm font-medium">{skill.name}</span>{" "}                                                    
                                                </Badge>
                                            );
                                        })}
                                    </div>
                                </div>
                            )} */}
                        </div>
                    </div>
                )}{" "}
                {/* <-- Added missing closing parenthesis */}
            </div>
        </div>
    );
}

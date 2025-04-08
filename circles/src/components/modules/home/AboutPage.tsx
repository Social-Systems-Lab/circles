"use client";

import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Quote } from "lucide-react";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import CircleTags from "@/components/modules/circles/circle-tags";
import { causes as allCauses, skills as allSkills } from "@/lib/data/causes-skills";
import { useIsCompact } from "@/components/utils/use-is-compact";
import RichText from "../feeds/RichText";

// Helper mappings for quick lookup
const causeMap = new Map(allCauses.map((c) => [c.handle, c]));
const skillMap = new Map(allSkills.map((s) => [s.handle, s]));

interface AboutPageProps {
    circle: Circle;
}

export default function AboutPage({ circle }: AboutPageProps) {
    const isCompact = useIsCompact();

    return (
        <div className="formatted mx-auto max-w-[1100px] px-0 py-0 md:px-4 md:py-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* --- Main Content Column --- */}
                <div className="md:col-span-2">
                    <div className={`bg-white p-6 ${isCompact ? "rounded-none" : "rounded-[15px] border-0 shadow-lg"}`}>
                        {/* Mission */}

                        {/* Main Content */}
                        {(circle.content || circle.description) && (
                            <>
                                <h1 className="my-4">About</h1>
                                {circle.content ? (
                                    <RichText content={circle.content} />
                                ) : (
                                    <p className="mb-6 text-base">{circle.description}</p>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* --- Sidebar Column --- */}
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

                        {/* Causes */}
                        {circle.causes && circle.causes.length > 0 && (
                            <div className="mb-6 w-full">
                                {" "}
                                {/* Increased mb */}
                                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                    Causes
                                </div>{" "}
                                {/* Increased mb */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {circle.causes.map((handle) => {
                                        const cause = causeMap.get(handle);
                                        if (!cause) return null;
                                        return (
                                            <Badge
                                                key={handle}
                                                variant="outline"
                                                className="flex items-center gap-1.5 px-2.5 py-1.5" // Increased padding
                                            >
                                                <Image
                                                    src={cause.picture.url}
                                                    alt=""
                                                    width={20} // Increased size
                                                    height={20} // Increased size
                                                    className="h-5 w-5 rounded-full object-cover" // Increased size
                                                />
                                                <span className="text-sm font-medium">{cause.name}</span>{" "}
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
                                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                    {" "}
                                    {/* Increased mb */}
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
                                                {/* Increased text size */}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

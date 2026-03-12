"use client";

import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Quote, ExternalLink } from "lucide-react";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import CircleTags from "@/components/modules/circles/circle-tags";
import { sdgs } from "@/lib/data/sdgs";
import { skillCategoryLabels, skillsV2 } from "@/lib/data/skills-v2";
import { useIsCompact } from "@/components/utils/use-is-compact";
import RichText from "../feeds/RichText";
import SdgList from "../sdgs/SdgList";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import OffersCard from "./offers-card";
import EngagementCard from "./engagement-card";
import NeedsCard from "./needs-card";

// Helper mappings for quick lookup
const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));
const skillMap = new Map(skillsV2.map((s) => [s.handle, s]));

interface AboutPageProps {
    circle: Circle;
}

export default function AboutPage({ circle }: AboutPageProps) {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);
    const [isSkillsExpanded, setIsSkillsExpanded] = React.useState(false);
    const [isNeedsExpanded, setIsNeedsExpanded] = React.useState(false);
    const isOwner = user?.did === circle.did;
    const isUserProfile = circle.circleType === "user";
    const userOfferSkills = circle.offers?.skills || [];
    const circleNeeds = !isUserProfile ? circle.needs?.tags || [] : [];
    const hasMoreSkills = userOfferSkills.length > 4;
    const hasMoreNeeds = circleNeeds.length > 4;
    const visibleSkills = isSkillsExpanded ? userOfferSkills : userOfferSkills.slice(0, 4);
    const visibleNeeds = isNeedsExpanded ? circleNeeds : circleNeeds.slice(0, 4);
    const remainingSkillsCount = Math.max(userOfferSkills.length - 4, 0);
    const remainingNeedsCount = Math.max(circleNeeds.length - 4, 0);

    const renderSkillPopoverBadge = (handle: string, key: string) => {
        const skill = skillMap.get(handle);
        const skillName = skill?.name || handle;
        const categoryLabel = skill?.category ? skillCategoryLabels[skill.category] : null;

        return (
            <Popover key={key}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`View details for ${skillName}`}
                    >
                        <Badge
                            variant="outline"
                            className="cursor-pointer text-sm font-medium transition-colors hover:bg-muted/60"
                        >
                            {skillName}
                        </Badge>
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-3">
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold">{skillName}</p>
                        {categoryLabel && (
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {categoryLabel}
                            </p>
                        )}
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            {skill?.description || "Description not available for this skill yet."}
                        </p>
                    </div>
                </PopoverContent>
            </Popover>
        );
    };

    // Check if sidebar has any content
    const hasSidebarContent =
        !!circle.mission ||
        !!(circle.location && (circle.location.city || circle.location.region || circle.location.country)) ||
        !!(!isUserProfile && circleNeeds.length > 0) ||
        !!(!isUserProfile && circle.causes && circle.causes.length > 0) ||
        !!circle.websiteUrl ||
        !!(isUserProfile && userOfferSkills.length > 0);

    const hasMainContent = !!circle.content || !!circle.description;

    return (
        <div className="formatted mx-auto max-w-[1100px] px-0 py-0 md:px-4 md:py-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* --- Main Content Column --- */}
                {/* Adjust column span based on sidebar visibility */}
                <div className={hasSidebarContent ? "md:col-span-2" : "md:col-span-3"}>
                    <div className="space-y-6">
                        <div
                            className={`bg-white p-6 ${isCompact ? "rounded-none" : "rounded-[15px] border-0 shadow-lg"}`}
                        >
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
                        <OffersCard circle={circle} isOwner={isOwner} />
                        <EngagementCard circle={circle} isOwner={isOwner} />
                        {isUserProfile && <NeedsCard circle={circle} isOwner={isOwner} />}
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

                            {/* Needs */}
                            {!isUserProfile && visibleNeeds.length > 0 && (
                                <div className="mb-6 w-full">
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        Needs
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {visibleNeeds.map((handle, index) => {
                                            return renderSkillPopoverBadge(handle, `${handle}-${index}`);
                                        })}
                                        {hasMoreNeeds && (
                                            <Badge
                                                variant="outline"
                                                className="cursor-pointer text-sm font-medium"
                                                role="button"
                                                tabIndex={0}
                                                aria-expanded={isNeedsExpanded}
                                                aria-label={
                                                    isNeedsExpanded
                                                        ? "Show fewer needs"
                                                        : `Show ${remainingNeedsCount} more needs`
                                                }
                                                onClick={() => setIsNeedsExpanded((prev) => !prev)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        setIsNeedsExpanded((prev) => !prev);
                                                    }
                                                }}
                                            >
                                                {isNeedsExpanded ? "Show less" : `+${remainingNeedsCount} more`}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* SDGs */}
                            {!isUserProfile && circle.causes && circle.causes.length > 0 && (
                                <div className="mb-6 w-full">
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">SDGs</div>
                                    <SdgList sdgHandles={circle.causes} className="grid-cols-4" />
                                </div>
                            )}

                            {/* Top Skills & Offers */}
                            {isUserProfile && visibleSkills.length > 0 && (
                                <div className="mb-6 w-full">
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        Top Skills & Offers
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {visibleSkills.map((handle) => {
                                            return renderSkillPopoverBadge(handle, handle);
                                        })}
                                        {hasMoreSkills && (
                                            <Badge
                                                variant="outline"
                                                className="cursor-pointer text-sm font-medium"
                                                role="button"
                                                tabIndex={0}
                                                aria-expanded={isSkillsExpanded}
                                                aria-label={
                                                    isSkillsExpanded
                                                        ? "Show fewer skills"
                                                        : `Show ${remainingSkillsCount} more skills`
                                                }
                                                onClick={() => setIsSkillsExpanded((prev) => !prev)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        setIsSkillsExpanded((prev) => !prev);
                                                    }
                                                }}
                                            >
                                                {isSkillsExpanded ? "Show less" : `+${remainingSkillsCount} more`}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Website */}
                            {circle.websiteUrl && (
                                <div className="mb-6 w-full">
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        Website
                                    </div>
                                    <a
                                        href={circle.websiteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 break-all text-[15px] text-foreground underline"
                                    >
                                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                        <span>{circle.websiteUrl}</span>
                                    </a>
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

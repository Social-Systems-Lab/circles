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
import { getInterestLabel } from "@/lib/data/interests";
import { sdgs } from "@/lib/data/sdgs";
import { getSkillDefinitionByHandle, skillCategoryLabels } from "@/lib/data/skills";
import { useIsCompact } from "@/components/utils/use-is-compact";
import RichText from "../feeds/RichText";
import SdgList from "../sdgs/SdgList";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { contactCircleAdminsAction } from "@/components/modules/chat/mongo-actions";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import OffersCard from "./offers-card";
import EngagementCard from "./engagement-card";
import NeedsCard from "./needs-card";
import VerifiedContributionsPanel, { type VerifiedContributionItem } from "./VerifiedContributionsPanel";

// Helper mappings for quick lookup
const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));

interface AboutPageProps {
    circle: Circle;
    verifiedContributions?: VerifiedContributionItem[];
    verifiedContributionPublicCount?: number;
}

export default function AboutPage({
    circle,
    verifiedContributions = [],
    verifiedContributionPublicCount = 0,
}: AboutPageProps) {
    const isCompact = useIsCompact();
    const router = useRouter();
    const { toast } = useToast();
    const [user] = useAtom(userAtom);
    const [isSkillsExpanded, setIsSkillsExpanded] = React.useState(false);
    const [isInterestsExpanded, setIsInterestsExpanded] = React.useState(false);
    const [isNeedsExpanded, setIsNeedsExpanded] = React.useState(false);
    const [isContactDialogOpen, setIsContactDialogOpen] = React.useState(false);
    const [contactType, setContactType] = React.useState<"offer_help" | "ask_question">("offer_help");
    const [contactMessage, setContactMessage] = React.useState("");
    const [contactError, setContactError] = React.useState("");
    const [isSendingContactMessage, setIsSendingContactMessage] = React.useState(false);
    const isOwner = user?.did === circle.did;
    const canEditAbout = isAuthorized(user, circle, features.settings.edit_about);
    const isUserProfile = circle.circleType === "user";
    const profileOfferSkills = circle.offers?.skills?.length ? circle.offers.skills : circle.skills || [];
    const currentUserOfferSkills = !isUserProfile
        ? user?.offers?.skills?.length
            ? user.offers.skills
            : user?.skills || []
        : [];
    const currentUserOfferSkillSet = new Set(currentUserOfferSkills);
    const profileInterests = isUserProfile
        ? circle.interests?.length
            ? circle.interests
            : circle.engagements?.interests || []
        : [];
    const circleNeeds = !isUserProfile ? circle.needs?.tags || [] : [];
    const matchingOfferNeedHandles = !isUserProfile
        ? Array.from(new Set(circleNeeds.filter((handle) => currentUserOfferSkillSet.has(handle))))
        : [];
    const hasMatchingOfferNeeds = !isUserProfile && !!user && matchingOfferNeedHandles.length > 0;
    const hasMoreSkills = profileOfferSkills.length > 4;
    const hasMoreInterests = profileInterests.length > 6;
    const hasMoreNeeds = circleNeeds.length > 4;
    const visibleSkills = isSkillsExpanded ? profileOfferSkills : profileOfferSkills.slice(0, 4);
    const visibleInterests = isInterestsExpanded ? profileInterests : profileInterests.slice(0, 6);
    const visibleNeeds = isNeedsExpanded ? circleNeeds : circleNeeds.slice(0, 4);
    const remainingSkillsCount = Math.max(profileOfferSkills.length - 4, 0);
    const remainingInterestsCount = Math.max(profileInterests.length - 6, 0);
    const remainingNeedsCount = Math.max(circleNeeds.length - 4, 0);

    const renderSkillPopoverBadge = (
        handle: string,
        key: string,
        variant: "skill" | "need" = "skill",
    ) => {
        const skill = getSkillDefinitionByHandle(handle);
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
                            variant={variant}
                            className="cursor-pointer text-sm font-medium"
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

    const hasProfileSidebarDetails =
        !!circle.mission ||
        !!(circle.location && (circle.location.city || circle.location.region || circle.location.country)) ||
        !!(!isUserProfile && circleNeeds.length > 0) ||
        !!hasMatchingOfferNeeds ||
        !!(!isUserProfile && circle.causes && circle.causes.length > 0) ||
        !!circle.websiteUrl ||
        !!(isUserProfile && (profileOfferSkills.length > 0 || profileInterests.length > 0));
    const shouldShowVerifiedContributions = isUserProfile;
    const hasSidebarContent = hasProfileSidebarDetails || shouldShowVerifiedContributions;

    const hasMainContent = isUserProfile ? !!circle.content : !!circle.content || !!circle.description;
    const canContactCircle = hasMatchingOfferNeeds && !isOwner;

    const openContactDialog = (nextContactType: "offer_help" | "ask_question" = "offer_help") => {
        setContactType(nextContactType);
        setContactError("");
        setContactMessage("");
        setIsContactDialogOpen(true);
    };

    const closeContactDialog = (open: boolean) => {
        setIsContactDialogOpen(open);
        if (!open) {
            setContactError("");
        }
    };

    const sendContactMessage = async () => {
        const trimmed = contactMessage.trim();
        if (!trimmed) {
            setContactError("Please add a message before sending.");
            return;
        }

        setIsSendingContactMessage(true);
        setContactError("");
        try {
            const result = await contactCircleAdminsAction(
                String(circle._id || ""),
                trimmed,
                matchingOfferNeedHandles,
                contactType,
            );
            if (!result.success || !result.roomId) {
                setContactError(result.message || "Could not start the conversation.");
                return;
            }

            setContactMessage("");
            setIsContactDialogOpen(false);
            router.push(`/chat/${result.roomId}`);
        } catch (error) {
            console.error("Failed to contact circle admins:", error);
            toast({
                title: "Could not send message",
                description: "Please try again.",
                variant: "destructive",
                icon: "error",
            });
        } finally {
            setIsSendingContactMessage(false);
        }
    };

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
                                    <div className="flex flex-row items-center justify-between gap-4">
                                        <h1 className="my-4">About</h1>
                                        {canEditAbout && (
                                            <Button
                                                variant="outline"
                                                onClick={() => router.push(`/circles/${circle.handle}/settings/about`)}
                                            >
                                                Edit
                                            </Button>
                                        )}
                                    </div>
                                    {circle.content ? (
                                        <RichText content={circle.content} />
                                    ) : isUserProfile ? (
                                        <p className="mb-6 text-base text-muted-foreground">
                                            This profile hasn&apos;t added an About section yet.
                                        </p>
                                    ) : (
                                        <p className="mb-6 text-base">{circle.description}</p>
                                    )}
                                </>
                            ) : (
                                // Default text if no content or description
                                <>
                                    <div className="flex flex-row items-center justify-between gap-4">
                                        <h1 className="my-4">About</h1>
                                        {canEditAbout && (
                                            <Button
                                                variant="outline"
                                                onClick={() => router.push(`/circles/${circle.handle}/settings/about`)}
                                            >
                                                Edit
                                            </Button>
                                        )}
                                    </div>
                                    <p className="mb-6 text-base text-muted-foreground">
                                        {isUserProfile
                                            ? "This profile hasn't added an About section yet."
                                            : "This circle hasn&apos;t added a description yet."}
                                    </p>
                                </>
                            )}
                        </div>
                        <OffersCard circle={circle} isOwner={isOwner} />
                        {isUserProfile && <EngagementCard circle={circle} isOwner={isOwner} />}
                        {!isUserProfile && <NeedsCard circle={circle} isOwner={isOwner} />}
                    </div>
                </div>
                {/* --- Sidebar Column (Conditionally Rendered) --- */}
                {hasSidebarContent && (
                    <div className="md:col-span-1">
                        <div className="space-y-6">
                            {hasProfileSidebarDetails && (
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
                                            return renderSkillPopoverBadge(handle, `${handle}-${index}`, "need");
                                        })}
                                        {hasMoreNeeds && (
                                            <Badge
                                                variant="outline"
                                                className="cursor-pointer border-gray-300 bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200"
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

                            {hasMatchingOfferNeeds && (
                                <div className="mb-6 w-full rounded-xl border border-[#e7d8c7] bg-[#f6efe6] p-3">
                                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8f5a2a]">
                                        You can help here
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {matchingOfferNeedHandles.map((handle, index) => {
                                            return renderSkillPopoverBadge(handle, `match-${handle}-${index}`);
                                        })}
                                    </div>
                                    {canContactCircle && (
                                        <div className="mt-3 flex flex-col items-center">
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="rounded-full border border-[#c8793a] bg-transparent text-[#c8793a] hover:bg-[#f3e4d6] hover:text-[#b86c31]"
                                                onClick={() => openContactDialog("offer_help")}
                                            >
                                                Offer Help
                                            </Button>
                                            <button
                                                type="button"
                                                className="mt-2 text-xs text-[#8f5a2a] underline-offset-2 hover:underline"
                                                onClick={() => openContactDialog("ask_question")}
                                            >
                                                Not sure yet? Ask a question first.
                                            </button>
                                        </div>
                                    )}
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
                                                className="cursor-pointer border-gray-300 bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200"
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

                            {isUserProfile && visibleInterests.length > 0 && (
                                <div className="mb-6 w-full">
                                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        Interests
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {visibleInterests.map((handle) => (
                                            <Badge
                                                key={handle}
                                                variant="interest"
                                                className="px-3 py-1 text-sm font-medium"
                                            >
                                                {getInterestLabel(handle)}
                                            </Badge>
                                        ))}
                                        {hasMoreInterests && (
                                            <Badge
                                                variant="outline"
                                                className="cursor-pointer border-gray-300 bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
                                                role="button"
                                                tabIndex={0}
                                                aria-expanded={isInterestsExpanded}
                                                aria-label={
                                                    isInterestsExpanded
                                                        ? "Show fewer interests"
                                                        : `Show ${remainingInterestsCount} more interests`
                                                }
                                                onClick={() => setIsInterestsExpanded((prev) => !prev)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        setIsInterestsExpanded((prev) => !prev);
                                                    }
                                                }}
                                            >
                                                {isInterestsExpanded ? "Show less" : `+${remainingInterestsCount} more`}
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
                            )}

                            {shouldShowVerifiedContributions && (
                                <div
                                    className={`bg-white p-6 ${
                                        isCompact ? "rounded-none" : "rounded-[15px] border-0 bg-muted/20 shadow-lg"
                                    }`}
                                >
                                    <VerifiedContributionsPanel
                                        items={verifiedContributions}
                                        totalPublicCount={verifiedContributionPublicCount}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}{" "}
                {/* <-- Added missing closing parenthesis */}
            </div>
            <Dialog open={isContactDialogOpen} onOpenChange={closeContactDialog}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>
                            {contactType === "ask_question"
                                ? "Ask the admins a question"
                                : `Offer Help to ${circle.name}`}
                        </DialogTitle>
                        <DialogDescription>
                            {contactType === "ask_question"
                                ? "Your question will create a shared thread with this circle&apos;s admins."
                                : "Your message will create a shared thread with this circle&apos;s admins."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Textarea
                            value={contactMessage}
                            onChange={(event) => {
                                setContactMessage(event.target.value);
                                if (contactError) {
                                    setContactError("");
                                }
                            }}
                            rows={5}
                            placeholder={
                                contactType === "ask_question"
                                    ? "What would you like to know about helping with this circle?"
                                    : "Write a short message about how you can help..."
                            }
                        />
                        {contactError && <p className="text-sm text-destructive">{contactError}</p>}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => closeContactDialog(false)}
                            disabled={isSendingContactMessage}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={sendContactMessage}
                            disabled={isSendingContactMessage || !contactMessage.trim()}
                        >
                            {isSendingContactMessage
                                ? "Sending..."
                                : contactType === "ask_question"
                                  ? "Send Question"
                                  : "Send Message"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

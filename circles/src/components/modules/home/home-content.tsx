"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { FaUsers } from "react-icons/fa";
import EditableImage from "./editable-image";
import EditableField from "./editable-field";
import InviteButton from "./invite-button";
import ChatButton from "./chat-button";
import FollowButton from "./follow-button";
import BookmarkButton from "./bookmark-button";
import GalleryTrigger from "./gallery-trigger";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { MessageButton } from "./message-button";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { NotificationSettingsDialog } from "@/components/notifications/NotificationSettingsDialog"; // Changed Popover to Dialog
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Settings } from "lucide-react";
import Link from "next/link";
import { VerifyAccountButton } from "../auth/verify-account-button";
import SocialLinks from "./social-links";
import { ProofOfHumanityHeaderAction } from "./proof-of-humanity-card";
import type { HumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { UserStatusBadge } from "@/components/modules/users/user-status-badge";
import { isVerifiedUser } from "@/lib/auth/verification";
import { hasContributorPerks } from "@/lib/auth/perks";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type HomeContentProps = {
    circle: Circle;
    authorizedToEdit: boolean;
    viewerDid?: string | null;
    parentCircle?: Circle;
    proofOfHumanitySummary?: HumanityVerificationSummary | null;
};

export default function HomeContent({
    circle,
    authorizedToEdit,
    viewerDid,
    parentCircle,
    proofOfHumanitySummary,
}: HomeContentProps) {
    const isUser = circle?.circleType === "user";
    const isKamooniRootCircle = circle?.handle === "default" || circle?.handle === "kamooni";
    const resolvedCircleLevel =
        circle.circleLevel ||
        (circle.parentCircleId && parentCircle?.circleType === "user" ? "profile_child" : undefined);
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);
    const isOwnUserProfile = isUser && (user?.did === circle.did || viewerDid === circle.did);
    const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
    const showSettingsButton = authorizedToEdit && circle.handle && (!isUser || isOwnUserProfile);
    const settingsButtonTitle = isUser ? "Profile settings" : "Circle settings";
    const settingsButtonClassName =
        "h-9 w-9 shrink-0 rounded-full border border-emerald-950 bg-emerald-950 text-white shadow-sm transition-colors hover:bg-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-950 focus-visible:ring-offset-2";

    const isMember = useMemo(() => {
        if (!user) return false;
        const membership = user.memberships?.find((m) => m.circleId === circle._id);
        return membership ? true : false;
    }, [circle._id, user]);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.HomeContent.1");
        }
    }, []);

    useEffect(() => {
        if (!isOwnUserProfile || !circle.handle) {
            setShowWelcomeDialog(false);
            return;
        }

        const completedOnboardingSteps = circle.completedOnboardingSteps ?? [];
        const hasSeenWelcomeOnboarding =
            completedOnboardingSteps.includes("welcome") ||
            completedOnboardingSteps.includes("member") ||
            completedOnboardingSteps.includes("final");
        const shouldSuppressWelcomeDialog =
            isVerifiedUser(circle) || hasContributorPerks(circle) || hasSeenWelcomeOnboarding;

        if (shouldSuppressWelcomeDialog) {
            setShowWelcomeDialog(false);
            return;
        }

        const storageKey = `kamooni:p_profile_welcome_seen:${circle.handle}`;
        const alreadySeen = window.localStorage.getItem(storageKey);

        if (!alreadySeen) {
            setShowWelcomeDialog(true);
        }
    }, [circle, isOwnUserProfile]);

    const handleWelcomeDialogChange = (nextOpen: boolean) => {
        setShowWelcomeDialog(nextOpen);

        if (!nextOpen && circle.handle) {
            window.localStorage.setItem(`kamooni:p_profile_welcome_seen:${circle.handle}`, "1");
        }
    };

    return (
        <>
            <Dialog open={showWelcomeDialog} onOpenChange={handleWelcomeDialogChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Welcome to Kamooni!</DialogTitle>
                        <DialogDescription className="space-y-3">
                            <p>You are now a test pilot!</p>
                            <p>
                                Click <strong>Request Verification</strong> when you&apos;re ready to become a
                                verified member.
                            </p>
                            <p>
                                You may later connect with others who can verify that you&apos;re human and not a bot.
                            </p>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" onClick={() => handleWelcomeDialogChange(false)}>
                            Got it
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex flex-1 flex-row justify-center">
                <div className="mb-0 ml-4 mr-4 flex max-w-[1100px] flex-1 flex-col">
                    <div className={`relative flex ${isCompact ? "flex-col items-center justify-center" : "flex-row"}`}>
                        <div
                            className={`relative flex ${isCompact ? "h-[50px] w-[100px]" : "h-[125px] w-[150px] min-w-[150px]"}`}
                        >
                            {/* Position the circle picture differently when compact. */}
                            <div
                                className={`absolute ${
                                    isCompact ? "left-1/2 top-[-50px] -translate-x-1/2" : "top-[-25px]"
                                }`}
                            >
                                <div className={`relative ${isCompact ? "h-[100px] w-[100px]" : "h-[150px] w-[150px]"}`}>
                                    {authorizedToEdit ? (
                                        <EditableImage
                                            id="picture"
                                            src={circle?.picture?.url ?? "/images/default-picture.png"}
                                            alt="Picture"
                                            className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                            fill
                                            circleId={circle._id!}
                                            triggerGallery={true}
                                            sizes="(max-width: 768px) 100px, 150px"
                                        />
                                    ) : (
                                        <>
                                            <Image
                                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                                alt="Picture"
                                                fill
                                                sizes="(max-width: 768px) 100px, 150px"
                                            />
                                            <div className="absolute top-0 h-full w-full">
                                                <GalleryTrigger
                                                    name="Profile Picture"
                                                    images={
                                                        circle.picture
                                                            ? [
                                                                  {
                                                                      name: "Profile Picture",
                                                                      type: "image",
                                                                      fileInfo: circle.picture,
                                                                  },
                                                              ]
                                                            : []
                                                    }
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {isCompact && (
                            <>
                                {isUser && (
                                    <div className={`absolute left-0 top-0 flex flex-row gap-1 pt-2`}>
                                        <MessageButton circle={circle} renderCompact={false} />
                                    </div>
                                )}

                                <div className={`absolute right-0 top-0 flex flex-row items-center gap-1 pt-2`}>
                                    {user && circle.circleType === "circle" && isMember && <ChatButton circle={circle} />}
                                    {!isUser && <InviteButton circle={circle} />}
                                    {user && <FollowButton circle={circle} />}
                                    {user && <BookmarkButton circle={circle} iconOnly />}
                                    {showSettingsButton && (
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="icon"
                                            className={settingsButtonClassName}
                                        >
                                            <Link
                                                href={`/circles/${circle.handle}/settings/about`}
                                                aria-label={`Open ${circle.name ?? "circle"} settings`}
                                                title={settingsButtonTitle}
                                            >
                                                <Settings className="h-5 w-5" />
                                            </Link>
                                        </Button>
                                    )}
                                    {circle._id && user && (
                                        <NotificationSettingsDialog
                                            entityType="CIRCLE"
                                            entityId={circle._id.toString()}
                                            className="h-8 w-8 p-0"
                                        />
                                    )}
                                </div>
                            </>
                        )}

                        {/* Center the text in compact mode. */}
                        <div
                            className={`flex flex-col justify-start p-4 pl-6 ${
                                isCompact ? "items-center text-center" : "min-w-0 flex-1 items-start"
                            }`}
                        >
                            <div
                                className={`flex w-full ${isCompact ? "justify-center" : "items-start justify-between gap-4"}`}
                            >
                                <div className="flex min-w-0 flex-wrap items-center gap-4">
                                    <h4 className="m-0 p-0 text-4xl font-bold text-gray-800">
                                        {authorizedToEdit ? (
                                            <EditableField id="name" value={circle.name ?? ""} circleId={circle._id!} />
                                        ) : (
                                            circle.name
                                        )}
                                    </h4>
                                    {proofOfHumanitySummary && (
                                        <ProofOfHumanityHeaderAction circle={circle} summary={proofOfHumanitySummary} />
                                    )}
                                </div>

                                {!isCompact && (
                                    <div className="flex shrink-0 flex-row items-center gap-1">
                                        <div className="pr-4 pt-2">
                                            <SocialLinks circle={circle} />
                                        </div>
                                        {isUser && <MessageButton circle={circle} renderCompact={false} />}
                                        {user && circle.circleType === "circle" && isMember && (
                                            <ChatButton circle={circle} />
                                        )}
                                        {!isUser && <InviteButton circle={circle} />}
                                        {user && <FollowButton circle={circle} />}
                                        {user && <BookmarkButton circle={circle} iconOnly />}
                                        {showSettingsButton && (
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="icon"
                                                className={settingsButtonClassName}
                                            >
                                                <Link
                                                    href={`/circles/${circle.handle}/settings/about`}
                                                    aria-label={`Open ${circle.name ?? "circle"} settings`}
                                                    title={settingsButtonTitle}
                                                >
                                                    <Settings className="h-5 w-5" />
                                                </Link>
                                            </Button>
                                        )}
                                        {circle._id && user && (
                                            <NotificationSettingsDialog
                                                entityType="CIRCLE"
                                                entityId={circle._id.toString()}
                                                className="ml-1"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isKamooniRootCircle && parentCircle && (
                                <div className="mt-3">
                                    {resolvedCircleLevel === "profile_child" ? (
                                        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                                            <span className="font-medium">Child of</span>
                                            <Link
                                                href={`/circles/${parentCircle.handle}`}
                                                className="font-semibold text-gray-900 hover:underline"
                                            >
                                                {parentCircle.name}
                                            </Link>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-500">
                                            Child circle of{" "}
                                            <Link
                                                href={`/circles/${parentCircle.handle}`}
                                                className="textLink hover:underline"
                                            >
                                                {parentCircle.name}
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                                {isUser ? <UserStatusBadge user={circle} /> : null}
                                {isOwnUserProfile ? <VerifyAccountButton /> : null}
                            </div>
                            {(circle.description || circle.mission) && (
                                <div className="line-clamp-1 pb-1 text-gray-600">
                                    {authorizedToEdit ? (
                                        <EditableField
                                            id={circle.description ? "description" : "mission"}
                                            value={(circle.description || circle.mission)!}
                                            circleId={circle._id!}
                                            multiline
                                        />
                                    ) : (
                                        (circle.description ?? circle.mission)
                                    )}
                                </div>
                            )}
                            {memberCount > 0 && (
                                <div className="flex flex-row items-center justify-center text-gray-600">
                                    <FaUsers />
                                    <p className="m-0 ml-2">
                                        {memberCount} {memberCount !== 1 ? "Followers" : "Follower"}
                                    </p>
                                </div>
                            )}
                            {isCompact && (
                                <div className="pb-2 pt-2">
                                    <SocialLinks circle={circle} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

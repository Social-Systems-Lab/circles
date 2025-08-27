"use client";

import React, { useEffect, useMemo } from "react";
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
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { VerifyAccountButton } from "../auth/verify-account-button";
import SocialLinks from "./social-links";

type HomeContentProps = { circle: Circle; authorizedToEdit: boolean; parentCircle?: Circle };

export default function HomeContent({ circle, authorizedToEdit, parentCircle }: HomeContentProps) {
    const isUser = circle?.circleType === "user";
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);

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

    return (
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
                                    />
                                ) : (
                                    <>
                                        <Image
                                            className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                            src={circle?.picture?.url ?? "/images/default-picture.png"}
                                            alt="Picture"
                                            fill
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
                            {isUser && circle._id !== user?._id && (
                                <div className={`absolute left-0 top-0 flex flex-row gap-1 pt-2`}>
                                    {user && <MessageButton circle={circle} renderCompact={false} />}
                                </div>
                            )}

                            <div className={`absolute right-0 top-0 flex flex-row items-center gap-1 pt-2`}>
                                {user && circle.circleType === "circle" && isMember && <ChatButton circle={circle} />}
                                <InviteButton circle={circle} />
                                {user && <FollowButton circle={circle} />}
                                {user && <BookmarkButton circle={circle} iconOnly />}
                                {/* Consistent Bell Icon for Mobile View */}
                                {circle._id && user && (
                                    <NotificationSettingsDialog // Changed Popover to Dialog
                                        entityType="CIRCLE"
                                        entityId={circle._id.toString()}
                                        className="h-8 w-8 p-0" // Adjust styling as needed for compact view
                                    />
                                )}
                            </div>
                        </>
                    )}

                    {/* Center the text in compact mode. */}
                    <div
                        className={`flex flex-col justify-start p-4 pl-6 ${
                            isCompact ? "items-center text-center" : "items-start"
                        }`}
                    >
                        <div className="flex flex-row items-center gap-4">
                            <h4 className="m-0 p-0 text-4xl font-bold text-gray-800">
                                {authorizedToEdit ? (
                                    <EditableField id="name" value={circle.name ?? ""} circleId={circle._id!} />
                                ) : (
                                    circle.name
                                )}
                            </h4>
                            {/* {!isCompact && <SocialLinks circle={circle} />} */}
                        </div>

                        {parentCircle && parentCircle?.circleType === "circle" && (
                            <div className="mt-2 text-sm text-gray-500">
                                Subcommunity of{" "}
                                <Link
                                    href={`/circles/${parentCircle.handle}`}
                                    className="text-blue-500 hover:underline"
                                >
                                    {parentCircle.name}
                                </Link>
                            </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                            {circle.isMember ? (
                                <Link href={`/circles/${circle.handle}/settings/subscription`}>
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                        <img
                                            src="/images/member-badge.png"
                                            alt="Member Badge"
                                            className="mr-1 h-4 w-4"
                                        />
                                        Founding Member
                                    </span>
                                </Link>
                            ) : (
                                <VerifyAccountButton />
                            )}
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

                    <div className="flex-1"></div>
                    {!isCompact && (
                        <div className={`flex flex-row gap-1 pt-2`}>
                            <div className="pr-4 pt-2">
                                <SocialLinks circle={circle} />
                            </div>
                            {user && isUser && circle._id !== user?._id && (
                                <MessageButton circle={circle} renderCompact={false} />
                            )}
                            {user && circle.circleType === "circle" && isMember && <ChatButton circle={circle} />}
                            <InviteButton circle={circle} />
                            {user && <FollowButton circle={circle} />}
                            {user && <BookmarkButton circle={circle} iconOnly />}
                            {/* Add NotificationSettingsDialog for the current circle */}
                            {circle._id &&
                                user && ( // Ensure circle ID and user are available
                                    <NotificationSettingsDialog // Changed Popover to Dialog
                                        entityType="CIRCLE"
                                        entityId={circle._id.toString()}
                                        className="ml-1" // Add some margin if needed
                                    />
                                )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

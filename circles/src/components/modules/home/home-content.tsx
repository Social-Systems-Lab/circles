"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { FaUsers } from "react-icons/fa";
import EditableImage from "./editable-image";
import EditableField from "./editable-field";
import InviteButton from "./invite-button";
import FollowButton from "./follow-button";
import GalleryTrigger from "./gallery-trigger";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { MessageButton } from "./message-button";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

type HomeContentProps = {
    circle: Circle;
    authorizedToEdit: boolean;
};

export default function HomeContent({ circle, authorizedToEdit }: HomeContentProps) {
    const isUser = circle?.circleType === "user";
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);

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
                                    <MessageButton circle={circle} renderCompact={false} />
                                </div>
                            )}
                            <div className={`absolute right-0 top-0 flex flex-row gap-1 pt-2`}>
                                <InviteButton circle={circle} />
                                <FollowButton circle={circle} />
                            </div>
                        </>
                    )}

                    {/* Center the text in compact mode. */}
                    <div
                        className={`flex flex-col justify-start p-4 pl-6 ${
                            isCompact ? "items-center text-center" : "items-start"
                        }`}
                    >
                        <h4 className="m-0 p-0 pb-1 text-4xl font-bold text-gray-800">
                            {authorizedToEdit ? (
                                <EditableField id="name" value={circle.name ?? ""} circleId={circle._id!} />
                            ) : (
                                circle.name
                            )}
                        </h4>
                        {(circle.description || circle.mission) && (
                            <div className="line-clamp-1 pb-1 text-gray-600">
                                {authorizedToEdit ? (
                                    <EditableField
                                        id={circle.description ? "description" : "mission"}
                                        value={(circle.description ?? circle.mission)!}
                                        circleId={circle._id!}
                                        multiline
                                    />
                                ) : (
                                    circle.description ?? circle.mission
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
                    </div>

                    <div className="flex-1"></div>
                    {!isCompact && (
                        <div className={`flex flex-row gap-1 pt-2`}>
                            {isUser && circle._id !== user?._id && (
                                <MessageButton circle={circle} renderCompact={false} />
                            )}
                            <InviteButton circle={circle} />
                            <FollowButton circle={circle} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

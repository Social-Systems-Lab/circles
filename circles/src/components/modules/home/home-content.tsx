// HomeModule.tsx
"use client";

import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { FaUsers } from "react-icons/fa";
import EditableImage from "./editable-image";
import EditableField from "./editable-field";
import InviteButton from "./invite-button";
import JoinButton from "./join-button";
import GalleryTrigger from "./gallery-trigger";
import { useIsCompact } from "@/components/utils/use-is-compact";

type HomeContentProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    authorizedToEdit: boolean;
};

export default function HomeContent({ circle, isDefaultCircle, authorizedToEdit }: HomeContentProps) {
    const isUser = circle?.circleType === "user";
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;
    const isCompact = useIsCompact();

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-0 ml-4 mr-4 flex max-w-[1100px] flex-1 flex-col">
                <div className="flex flex-row">
                    <div className={`relative flex ${isCompact ? "h-[75px] w-[75px]" : "h-[125px] w-[150px]"}`}>
                        <div className={`absolute ${isCompact ? "top-[10px]" : "top-[-25px]"}`}>
                            <div className={`relative ${isCompact ? "h-[75px] w-[75px]" : "h-[150px] w-[150px]"}`}>
                                {authorizedToEdit ? (
                                    <EditableImage
                                        id="picture"
                                        src={circle?.picture?.url ?? "/images/default-picture.png"}
                                        alt="Picture"
                                        className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                        fill
                                        circleId={circle._id!}
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
                                            <GalleryTrigger name="Profile Picture" image={circle.picture} />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-start justify-start p-4 pl-6">
                        <h4 className="m-0 p-0 pb-1 text-4xl font-bold text-gray-800">
                            {authorizedToEdit ? (
                                <EditableField id="name" value={circle.name ?? ""} circleId={circle._id!} />
                            ) : (
                                circle.name
                            )}
                        </h4>
                        {circle.description && (
                            <div className="line-clamp-1 pb-1 text-gray-600">
                                {authorizedToEdit ? (
                                    <EditableField
                                        id="description"
                                        value={circle.description}
                                        circleId={circle._id!}
                                        multiline
                                    />
                                ) : (
                                    circle.description
                                )}
                            </div>
                        )}
                        {memberCount > 0 && (
                            <div className="flex flex-row items-center justify-center text-gray-600">
                                <FaUsers />
                                <p className="m-0 ml-2">
                                    {memberCount}{" "}
                                    {memberCount !== 1
                                        ? isUser
                                            ? "Friends"
                                            : "Members"
                                        : isUser
                                          ? "Friend"
                                          : "Member"}
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex-1"></div>
                    <div className="flex flex-row gap-1 pt-2">
                        <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                        <JoinButton circle={circle} />
                    </div>
                </div>
            </div>
        </div>
    );
}

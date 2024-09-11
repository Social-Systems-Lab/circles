// HomeModule.tsx
import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { FaUsers } from "react-icons/fa";
import EditableImage from "./editable-image";
import EditableField from "./editable-field";
import InviteButton from "./invite-button";
import JoinButton from "./join-button";

type HomeContentProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    isUser?: boolean;
    authorizedToEdit: boolean;
};

export default function HomeContent({ circle, isDefaultCircle, isUser, authorizedToEdit }: HomeContentProps) {
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;

    return (
        <div className="flex flex-1 flex-col">
            <div className="relative flex justify-center">
                <div className="absolute top-[-75px]">
                    <div className="h-[150px] w-[150px]">
                        {authorizedToEdit ? (
                            <EditableImage
                                id="picture"
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Picture"
                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                fill
                                circleId={circle._id!}
                                isUser={isUser}
                            />
                        ) : (
                            <Image
                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Picture"
                                fill
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="mb-8 mt-[65px] flex flex-col items-center justify-center">
                <h4 className="text-4xl font-bold text-gray-800">
                    {authorizedToEdit ? (
                        <EditableField id="name" value={circle.name ?? ""} circleId={circle._id!} isUser={isUser} />
                    ) : (
                        circle.name
                    )}
                </h4>
                {circle.description && (
                    <div className="pl-4 pr-4 text-center text-gray-600">
                        {authorizedToEdit ? (
                            <EditableField
                                id="description"
                                value={circle.description}
                                circleId={circle._id!}
                                isUser={isUser}
                                multiline
                            />
                        ) : (
                            circle.description
                        )}
                    </div>
                )}
                {memberCount > 0 && (
                    <div className="flex flex-row items-center justify-center pt-4 text-gray-600">
                        <FaUsers />
                        <p className="m-0 ml-2">
                            {memberCount}{" "}
                            {memberCount !== 1 ? (isUser ? "Friends" : "Members") : isUser ? "Friend" : "Member"}
                        </p>
                    </div>
                )}
                {/* <div className="flex flex-row gap-1 pt-4">
                    <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                    <JoinButton circle={circle} />
                </div> */}
            </div>
        </div>
    );
}

// HomeModule.tsx
import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import JoinButton from "./join-button";
import InviteButton from "./invite-button";
import EditableImage from "./editable-image";

type HomeContentProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    isUser?: boolean;
    authorizedToEdit: boolean;
};

export default function HomeCover({ circle, isDefaultCircle, isUser, authorizedToEdit }: HomeContentProps) {
    return (
        <div className="relative h-[400px] w-full">
            {authorizedToEdit ? (
                <EditableImage
                    id="cover"
                    src={circle?.cover?.url ?? "/images/default-cover.png"}
                    alt="Cover"
                    className="object-cover"
                    fill
                    circleId={circle._id!}
                />
            ) : (
                <Image
                    src={circle?.cover?.url ?? "/images/default-cover.png"}
                    alt="Cover"
                    objectFit="cover"
                    sizes="100vw"
                    fill
                />
            )}
            <div className="absolute bottom-[-45px] right-2 flex flex-row gap-1">
                <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                <JoinButton circle={circle} />
            </div>
        </div>
    );
}

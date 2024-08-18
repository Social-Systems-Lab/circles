// StaticHomeModule.tsx
import Image from "next/image";
import { Circle } from "@/models/models";
import JoinButton from "./join-button";
import { FaUsers } from "react-icons/fa";
import InviteButton from "./invite-button";

type StaticHomeModuleProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    isUser?: boolean;
};

export default function StaticHomeModule({ circle, isDefaultCircle, isUser }: StaticHomeModuleProps) {
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;

    return (
        <div className="flex flex-1 flex-col">
            <div className="relative h-[400px] w-full">
                <Image
                    src={circle?.cover?.url ?? "/images/default-cover.png"}
                    alt="Cover"
                    objectFit="cover"
                    sizes="100vw"
                    fill
                />
            </div>
            <div className="relative flex justify-center">
                <div className="absolute top-[-60px]">
                    <div className="h-[124px] w-[124px]">
                        <Image
                            className="rounded-full border-2 border-white object-cover"
                            src={circle?.picture?.url ?? "/images/default-picture.png"}
                            alt="Picture"
                            objectFit="cover"
                            fill
                        />
                    </div>
                </div>
                <div className="absolute right-2 top-2 flex flex-row gap-1">
                    <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                    <JoinButton circle={circle} />
                </div>
            </div>

            <div className="mb-8 mt-[44px] flex flex-col items-center justify-center">
                <h4>{circle.name}</h4>
                {circle.description && <p className="pl-4 pr-4">{circle.description}</p>}
                {memberCount > 0 && (
                    <div className="flex flex-row items-center justify-center pt-4">
                        <FaUsers />
                        <p className="m-0 ml-2 mr-4">
                            {memberCount}{" "}
                            {memberCount !== 1 ? (isUser ? "Friends" : "Members") : isUser ? "Friend" : "Member"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

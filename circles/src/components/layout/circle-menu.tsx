"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Circle } from "@/models/models";
import Image from "next/image";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export default function CircleMenu({
    circle,
    defaultCircle,
    isDefaultCircle,
}: {
    circle: Circle;
    defaultCircle: Circle;
    isDefaultCircle: boolean;
}) {
    const [circleMenuOpen, setCircleMenuOpen] = useState(false);
    const [user, setUser] = useAtom(userAtom);
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.CircleMenu.1");
        }
    }, []);

    const circles = useMemo(() => {
        if (!user) return [];
        let memberCircles = user.memberships
            ?.filter((x) => x.circle.circleType !== "user" && x.circle.handle !== defaultCircle.handle)
            .map((m) => m.circle);

        return [defaultCircle, ...memberCircles];
    }, [defaultCircle, user]);

    const handleCircleClick = (circle: Circle) => {
        setCircleMenuOpen(false);
        if (circle.handle === defaultCircle.handle && circle.circleType !== "user") {
            router.push("/");
            return;
        }

        router.push(`/circles/${circle.handle}`);
    };

    const handleUserClick = () => {
        if (!user) return;
        setCircleMenuOpen(false);
        router.push(`/circles/${user.handle}`);
    };

    return (
        <div className="ml-4 mr-4 flex flex-shrink-0 flex-col items-center justify-center md:mb-4 md:ml-0 md:mr-0 md:mt-4 ">
            <Popover open={circleMenuOpen} onOpenChange={setCircleMenuOpen}>
                <PopoverTrigger>
                    <div className="h-[40px] w-[40px]">
                        <Image
                            src={circle?.picture?.url ?? "/images/default-picture.png"}
                            alt="Logo"
                            className="h-[40px] w-[40px] overflow-hidden rounded-full object-cover shadow"
                            width={100}
                            height={100}
                        />
                    </div>
                </PopoverTrigger>
                <PopoverContent className="z-[2000] ml-4 w-auto p-0">
                    <div className="flex flex-col">
                        {user && (
                            <div
                                key={user._id}
                                className="flex cursor-pointer flex-row items-center p-2 pl-2 pr-6 hover:bg-[#dddddd]"
                                onClick={() => handleUserClick()}
                            >
                                <div className="h-[40px] w-[40px]">
                                    <Image
                                        src={user.picture?.url ?? "/images/default-user-picture.png"}
                                        alt="Logo"
                                        className="h-[40px] w-[40px] overflow-hidden rounded-full object-cover shadow"
                                        width={100}
                                        height={100}
                                    />
                                </div>
                                <div className="pl-3">{user.name}</div>
                            </div>
                        )}

                        {circles?.map((circleItem) => (
                            <div
                                key={circleItem._id}
                                className="flex cursor-pointer flex-row items-center p-2 pl-2 pr-6 hover:bg-[#dddddd]"
                                onClick={() => handleCircleClick(circleItem)}
                            >
                                <div className="h-[40px] w-[40px]">
                                    <Image
                                        src={circleItem?.picture?.url ?? "/images/default-picture.png"}
                                        alt="Logo"
                                        className="h-[40px] w-[40px] overflow-hidden rounded-full object-cover shadow"
                                        width={100}
                                        height={100}
                                    />
                                </div>
                                <div className="pl-3">{circleItem.name}</div>
                            </div>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

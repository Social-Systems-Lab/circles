"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../ui/button";
import { userAtom, userToolboxDataAtom, sidePanelContentVisibleAtom, authInfoAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { UserPicture } from "../modules/members/user-picture";
import { Bell, MessageCircle } from "lucide-react";
import { UserToolboxTab } from "@/models/models";

type ChatRoomPreview = {
    id: number;
    name: string;
    message: string;
    avatar: string;
    status: string;
};

const ProfileMenuBar = () => {
    const router = useRouter();
    const [authInfo] = useAtom(authInfoAtom);
    const [user, setUser] = useAtom(userAtom);
    const searchParams = useSearchParams();
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);

    const onLogInClick = () => {
        let redirectTo = searchParams.get("redirectTo") ?? "/";
        router.push("/login?redirectTo=" + redirectTo);
    };

    const onSignUpClick = () => {
        let redirectTo = searchParams.get("redirectTo");
        router.push("/signup?redirectTo=" + redirectTo);
    };

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const openUserToolbox = (tab: UserToolboxTab) => {
        if (
            sidePanelContentVisible === "toolbox" &&
            (userToolboxState?.tab === tab || (tab === "profile" && userToolboxState))
        ) {
            setUserToolboxState(undefined);
            return;
        }
        setUserToolboxState({ tab: tab });
    };

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-1 overflow-hidden">
            {authInfo.authStatus === "authenticated" && user && (
                <>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                            onClick={() => openUserToolbox("chat")}
                        >
                            <MessageCircle className="h-5 w-5" />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                            onClick={() => openUserToolbox("notifications")}
                        >
                            <Bell className="h-5 w-5" />
                        </Button>

                        <Button
                            className="h-auto w-auto rounded-full p-0"
                            variant="ghost"
                            onClick={() => openUserToolbox("profile")}
                        >
                            <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                        </Button>
                    </div>
                </>
            )}

            {authInfo.authStatus === "unauthenticated" && (
                <div className="flex flex-row gap-2">
                    <Button
                        className="h-full w-full bg-[#00000077] text-white"
                        onClick={onLogInClick}
                        variant="outline"
                    >
                        Log in
                    </Button>
                    <Button className="h-full w-full" onClick={onSignUpClick} variant="outline">
                        Sign up
                    </Button>
                </div>
            )}
        </div>
    );
};

export const ProfileMenu = () => {
    return (
        <Suspense>
            <ProfileMenuBar />
        </Suspense>
    );
};

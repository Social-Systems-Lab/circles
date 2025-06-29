// profile-menu.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "../ui/button";
import {
    userAtom,
    userToolboxDataAtom,
    sidePanelContentVisibleAtom,
    authInfoAtom,
    unreadCountsAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { UserPicture } from "../modules/members/user-picture";
import { Bell, MessageCircle } from "lucide-react";
import { UserToolboxTab } from "@/models/models";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { VerifyAccountButton } from "../modules/auth/verify-account-button";

const ProfileMenuBar = () => {
    const router = useRouter();
    const [authInfo] = useAtom(authInfoAtom);
    const [user, setUser] = useAtom(userAtom);
    const searchParams = useSearchParams();
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [unreadCounts] = useAtom(unreadCountsAtom);
    const pathname = usePathname();

    const totalUnreadMessages = useMemo(() => {
        if (!user?.chatRoomMemberships) {
            return 0;
        }

        // get sum of unread messages in all chat rooms
        return user?.chatRoomMemberships
            .map((room) => {
                const unread = Object.entries(unreadCounts).find(([key]) =>
                    key.startsWith(room.chatRoom.matrixRoomId!),
                )?.[1];
                if (unread) {
                    return unread;
                }
                return 0;
            })
            .reduce((acc, val) => acc + val, 0);
    }, [unreadCounts, user?.chatRoomMemberships]);

    const unreadNotifications = useMemo(() => {
        if (!user?.matrixNotificationsRoomId) {
            return 0;
        }
        return unreadCounts[user.matrixNotificationsRoomId] || 0;
    }, [unreadCounts, user?.matrixNotificationsRoomId]);

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

    const onLogInClick = () => {
        let redirectTo = searchParams.get("redirectTo") ?? "/";
        router.push("/login?redirectTo=" + redirectTo);
    };

    const onSignUpClick = () => {
        let redirectTo = searchParams.get("redirectTo") ?? "/";
        router.push("/signup?redirectTo=" + redirectTo);
    };

    // hide when in the welcome screen
    if (pathname === "/signup" || pathname === "/login") {
        return null;
    }

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-1 overflow-visible">
            <>
                <div className="flex items-center space-x-2">
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

                    {authInfo.authStatus === "authenticated" && user && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                                onClick={() => openUserToolbox("chat")}
                            >
                                <MessageCircle className="h-5 w-5" />
                                {totalUnreadMessages > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                        {totalUnreadMessages}
                                    </span>
                                )}
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                                onClick={() => openUserToolbox("notifications")}
                            >
                                <Bell className="h-5 w-5" />
                                {unreadNotifications > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                        {unreadNotifications}
                                    </span>
                                )}
                            </Button>

                            <Button
                                className="relative h-auto w-auto rounded-full p-0"
                                variant="ghost"
                                onClick={() => router.push(`/circles/${user?.handle}`)}
                            >
                                <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                                {user.isMember && (
                                    <img
                                        src="/images/member-badge.png"
                                        alt="Member Badge"
                                        className="absolute bottom-0 right-0 h-4 w-4"
                                    />
                                )}
                                {!user.isMember && user.isVerified && (
                                    <img
                                        src="/images/verified-badge.png"
                                        alt="Verified Badge"
                                        className="absolute bottom-0 right-0 h-4 w-4"
                                    />
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </>
        </div>
    );
};

export const ProfileMenu = () => {
    const [loadStateKey, setLoadStateKey] = useState(Date.now().toString());

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ProfileMenu.1");
        }

        // Force re-render after component mount to ensure proper hydration
        const timer = setTimeout(() => {
            setLoadStateKey(Date.now().toString());
        }, 100);

        return () => clearTimeout(timer);
    }, []);

    return (
        <Suspense fallback={<div className="h-10 w-10"></div>}>
            <ProfileMenuBar key={loadStateKey} />
        </Suspense>
    );
};

// profile-menu.tsx
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "../ui/button";
import {
    userAtom,
    userToolboxDataAtom,
    sidePanelContentVisibleAtom,
    authInfoAtom,
    notificationUnreadCountAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { UserPicture } from "../modules/members/user-picture";
import { Bell } from "lucide-react";
import { UserToolboxTab } from "@/models/models";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { LuClipboardCheck, LuMail } from "react-icons/lu";
import { listChatRoomsAction } from "../modules/chat/actions";

const ProfileMenuBar = () => {
    const router = useRouter();
    const [authInfo] = useAtom(authInfoAtom);
    const [user] = useAtom(userAtom);
    const searchParams = useSearchParams();
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [notificationUnreadCount, setNotificationUnreadCount] = useAtom(notificationUnreadCountAtom);
    const [messageUnreadCount, setMessageUnreadCount] = useState(0);
    const pathname = usePathname();

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!user?.did) {
            setNotificationUnreadCount(0);
            setMessageUnreadCount(0);
            return;
        }

        let cancelled = false;
        const loadMessageUnreadCount = async () => {
            try {
                const result = await listChatRoomsAction();
                if (!cancelled) {
                    const unreadTotal =
                        result.success && result.rooms
                            ? result.rooms.reduce((total, room) => total + (room.unreadCount || 0), 0)
                            : 0;
                    setMessageUnreadCount(unreadTotal);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to fetch message unread count:", error);
                }
            }
        };

        const loadNotificationUnreadCount = async () => {
            try {
                const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`Failed to load notification unread count (${response.status})`);
                }

                const data = await response.json();
                if (!cancelled) {
                    setNotificationUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to fetch notification unread count:", error);
                }
            }
        };

        void loadMessageUnreadCount();
        void loadNotificationUnreadCount();
        const intervalId = window.setInterval(() => {
            void loadMessageUnreadCount();
            void loadNotificationUnreadCount();
        }, 15000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [setNotificationUnreadCount, user?.did]);

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
                                onClick={() => router.push("/chat")}
                            >
                                <LuMail className="h-5 w-5" />
                                {messageUnreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                        {messageUnreadCount}
                                    </span>
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                                onClick={() => openUserToolbox("events")}
                            >
                                <LuClipboardCheck className="h-5 w-5" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                                onClick={() => openUserToolbox("notifications")}
                            >
                                <Bell className="h-5 w-5" />
                                {notificationUnreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                        {notificationUnreadCount}
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

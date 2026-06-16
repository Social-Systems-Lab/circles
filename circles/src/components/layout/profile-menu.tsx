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
import { Bell, ChevronRight } from "lucide-react";
import { Circle, UserToolboxTab } from "@/models/models";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { LuClipboardCheck, LuMail } from "react-icons/lu";
import { listChatRoomsAction } from "../modules/chat/actions";
import { getCircleDefaultPath } from "@/lib/utils/circle-routes";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { isPeerifyManagedIdentity } from "@/lib/peerify/artist-profile";

const getManagedIdentities = (user?: Circle & { memberships?: Array<{ circle: Circle; userGroups?: string[] }> }) =>
    user?.memberships
        ?.filter((membership) => isPeerifyManagedIdentity(membership.circle))
        .filter((membership) => membership.userGroups?.includes("admins"))
        .map((membership) => membership.circle) ?? [];

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
    const isMobile = useIsMobile();

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
        router.push("/signup/pilot?redirectTo=" + redirectTo);
    };

    // hide when in the welcome screen
    if (pathname?.startsWith("/signup") || pathname === "/login") {
        return null;
    }

    if (!isMounted) {
        return null;
    }

    const isMobileExplore = isMobile && pathname === "/explore";
    const managedIdentities = getManagedIdentities(user);

    const openProfile = (target: Circle) => {
        router.push(getCircleDefaultPath(target));
    };

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
                            {!isMobileExplore && (
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
                                </>
                            )}

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button className="relative h-auto w-auto rounded-full p-0" variant="ghost">
                                        <UserPicture
                                            name={user?.name}
                                            picture={user?.picture?.url}
                                            size="40px"
                                            circleType="user"
                                        />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-80 p-2">
                                    <div className="flex flex-col">
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
                                            onClick={() => openProfile(user)}
                                        >
                                            <UserPicture
                                                name={user.name}
                                                picture={user.picture?.url}
                                                size="36px"
                                                circleType="user"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-semibold">{user.name}</div>
                                                <div className="truncate text-xs text-muted-foreground">
                                                    Personal profile
                                                </div>
                                            </div>
                                        </button>

                                        {managedIdentities.length > 0 && (
                                            <div className="mt-1 border-t pt-1">
                                                {managedIdentities.map((identity) => (
                                                    <button
                                                        key={identity._id}
                                                        type="button"
                                                        className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
                                                        onClick={() => openProfile(identity)}
                                                    >
                                                        <UserPicture
                                                            name={identity.name}
                                                            picture={
                                                                identity.picture?.url ??
                                                                "/peerify/default-artist-avatar.svg"
                                                            }
                                                            size="36px"
                                                            circleType="circle"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-sm font-semibold">
                                                                {identity.name}
                                                            </div>
                                                            <div className="truncate text-xs text-muted-foreground">
                                                                Peerify identity
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="mt-1 justify-between border-t pt-3 text-sm"
                                            onClick={() => router.push("/profiles")}
                                        >
                                            See all profiles / identities
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
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

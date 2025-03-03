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
import { IoMdQrScanner } from "react-icons/io";
import { MdQrCodeScanner, MdQrCode } from "react-icons/md";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import QRCode from "react-qr-code";
import { createTestAccountAction } from "../auth/actions";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

const QRCodePopover = () => {
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);
    const [user, setUser] = useAtom(userAtom);

    const onCreateTestAccount = async () => {
        const response = await createTestAccountAction();
        if (response) {
            setAuthInfo({
                authStatus: "authenticated",
                inSsiApp: false,
                currentAccount: undefined,
            });
            setUser(response.user);
        }
    };

    if (authInfo.inSsiApp) return null;

    return (
        <div className="flex items-center justify-center">
            <div className="p-6">
                <div className="mb-4 text-xl font-semibold">Sign in with the Circles App</div>
                <QRCode value={JSON.stringify(authInfo.challenge)} size={200} />
                <p className="mt-4 text-sm text-gray-600">
                    Scan this code with your Circles app to authenticate. Download the app if you don&apos;t have it
                    installed.
                </p>
                {/* Discrete icon button to log in with test account */}

                <Button variant="ghost" size="sm" className="mt-4" onClick={onCreateTestAccount}>
                    Log in with test account
                </Button>
            </div>
        </div>
    );
};

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

    const openQRScanner = () => {
        window.ReactNativeWebView?.postMessage(
            JSON.stringify({
                type: "ScanQRCode",
            }),
        );
    };

    const onLogInClick = () => {
        let redirectTo = searchParams.get("redirectTo") ?? "/";
        router.push("/login?redirectTo=" + redirectTo);
    };

    const onSignUpClick = () => {
        let redirectTo = searchParams.get("redirectTo");
        router.push("/signup?redirectTo=" + redirectTo);
    };

    const toggleQRCode = () => {
        window.ReactNativeWebView?.postMessage(
            JSON.stringify({
                type: "ScanQRCode",
            }),
        );
    };

    // hide when in the welcome screen
    if (pathname === "/welcome" || pathname === "/signup" || pathname === "/login") {
        return null;
    }

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-1 overflow-visible">
            <>
                <div className="flex items-center space-x-2">
                    {/* If outside SSI app and unauthenticated - show QR code to sign in */}
                    {/* {authInfo.authStatus === "unauthenticated" && !authInfo.inSsiApp && (
                        <Popover>
                            <PopoverTrigger>
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f1f1] hover:bg-[#cecece]">
                                    <MdQrCode size="20px" />
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="mr-2">
                                <QRCodePopover />
                            </PopoverContent>
                        </Popover>
                    )} */}

                    {/* If authenticated and in SSI app - show QR code scanner */}
                    {authInfo.authStatus === "authenticated" && authInfo.inSsiApp && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                            onClick={() => openQRScanner()}
                        >
                            <MdQrCodeScanner size="20px" />
                        </Button>
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
                                className="h-auto w-auto rounded-full p-0"
                                variant="ghost"
                                onClick={() => openUserToolbox("profile")}
                            >
                                <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
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

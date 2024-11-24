"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../ui/button";
import { userAtom, userToolboxDataAtom, sidePanelContentVisibleAtom, authInfoAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { UserPicture } from "../modules/members/user-picture";
import { Bell, MessageCircle } from "lucide-react";
import { UserToolboxTab } from "@/models/models";
import { IoMdQrScanner } from "react-icons/io";
import { MdQrCodeScanner, MdQrCode } from "react-icons/md";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import QRCode from "react-qr-code";

const QRCodePopover = () => {
    const [authInfo] = useAtom(authInfoAtom);

    return (
        <div className="flex items-center justify-center">
            <div className="p-6">
                <div className="mb-4 text-xl font-semibold">Sign in with the Circles App</div>
                <QRCode value={JSON.stringify(authInfo.challenge)} size={200} />
                <p className="mt-4 text-sm text-gray-600">
                    Scan this code with your Circles app to authenticate. Download the app if you don’t have it
                    installed.
                </p>
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

    const toggleQRCode = () => {
        window.ReactNativeWebView?.postMessage(
            JSON.stringify({
                type: "ScanQRCode",
            }),
        );
    };

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-1 overflow-hidden">
            <>
                <div className="flex items-center space-x-2">
                    {/* If outside SSI app and unauthenticated - show QR code to sign in */}
                    {authInfo.authStatus === "unauthenticated" && !authInfo.inSsiApp && (
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
                    )}

                    {/* {qrCodePopoverVisible && <QRCodePopover onClose={() => setQRCodePopoverVisible(false)} />} */}

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

                    {authInfo.authStatus === "authenticated" && user && (
                        <>
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
                        </>
                    )}
                </div>
            </>

            {/* {authInfo.authStatus === "unauthenticated" && (
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
            )} */}
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

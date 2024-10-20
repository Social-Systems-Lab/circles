"use client";

import React, { Suspense, use, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "../ui/button";
import { logOut } from "../auth/actions";
import { userAtom, authenticatedAtom, userToolboxStateAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPicture } from "../modules/members/user-picture";
import { HiOutlineLogout } from "react-icons/hi";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
    Bell,
    MessageCircle,
    Calendar,
    Edit,
    CheckSquare,
    BarChart2,
    X,
    Phone,
    Video,
    Paperclip,
    Smile,
    Send,
    Minus,
} from "lucide-react";
import { UserToolboxState } from "@/models/models";

type ChatRoomPreview = {
    id: number;
    name: string;
    message: string;
    avatar: string;
    status: string;
};

const ProfileMenuBar = () => {
    const router = useRouter();
    const [authenticated, setAuthenticated] = useAtom(authenticatedAtom);
    const [user, setUser] = useAtom(userAtom);
    const searchParams = useSearchParams();
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxStateAtom);

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

    const openUserToolbox = (state: UserToolboxState) => {
        if (userToolboxState === state || (state === "profile" && userToolboxState)) {
            setUserToolboxState(undefined);
            return;
        }
        setUserToolboxState(state);
    };

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-1 overflow-hidden">
            {authenticated && user && (
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

            {authenticated === false && (
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

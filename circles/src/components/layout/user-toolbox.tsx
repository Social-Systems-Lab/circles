//user-toolbox.tsx - Displays the user toolbox that contains the user's chat rooms, notifications, circles, contacts, and account settings
"use client";

import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, MessageCircle, Users, Circle as CircleIcon } from "lucide-react";
import { MdOutlineLogout } from "react-icons/md";
import { RxDashboard } from "react-icons/rx";
import {
    authInfoAtom,
    contentPreviewAtom,
    sidePanelContentVisibleAtom,
    userAtom,
    userToolboxDataAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter, usePathname } from "next/navigation";
import { Circle, MemberDisplay, UserToolboxTab } from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { logOut } from "../auth/actions";
import { Notifications } from "./notifications";
import Link from "next/link";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useIsMobile } from "../utils/use-is-mobile";
import { ChatList } from "../modules/chat/chat-list";
import { getCircleByIdAction } from "@/components/modules/circles/actions";

export const UserToolbox = () => {
    const [user, setUser] = useAtom(userAtom);
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [tab, setTab] = useState<UserToolboxTab>(undefined);
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);
    const pathname = usePathname();
    const [prevPath, setPrevPath] = useState(pathname);
    const isMobile = useIsMobile();

    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.UserToolbox.1");
        }
    }, []);

    useEffect(() => {
        if (!isMobile) return;

        if (prevPath !== pathname) {
            setUserToolboxState(undefined); // Close the toolbox on navigation
        }
        setPrevPath(pathname);
    }, [pathname, prevPath, setUserToolboxState, isMobile]);

    useEffect(() => {
        if (!userToolboxState?.tab) {
            setTab("chat");
        } else {
            setTab(userToolboxState.tab === "profile" ? "chat" : userToolboxState.tab);
        }
    }, [userToolboxState?.tab]);

    const openCircle = (circle: Circle) => {
        console.log("openCircle", circle.circleType, circle.parentCircleId);
        router.push(`/circles/${circle.handle}`);
    };

    const circles =
        user?.memberships
            ?.filter((m) => m.circle.circleType === "circle" && m.circle.handle !== "default")
            ?.map((membership) => membership.circle) || [];

    const contacts =
        user?.memberships
            ?.filter((m) => m.circle.circleType === "user" && m.circle._id !== user?._id)
            ?.map((membership) => membership.circle) || [];

    const signOut = async () => {
        // clear the user data and redirect to the you've been signed out
        await logOut();

        setAuthInfo({ ...authInfo, authStatus: "unauthenticated" });
        setUser(undefined);
        // close the toolbox
        setUserToolboxState(undefined);

        router.push("/welcome");
    };

    if (userToolboxState === undefined) return null;

    return (
        <Card className="h-full overflow-auto border-0">
            <CardHeader className="p-4">
                <div className="flex items-center space-x-4">
                    <Link href={`/circles/${user?.handle}`}>
                        <Avatar className="h-12 w-12">
                            <AvatarImage
                                src={user?.picture?.url || "/placeholder.svg?height=48&width=48"}
                                alt={user?.name}
                            />
                            <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                    </Link>
                    <div>
                        <Link href={`/circles/${user?.handle}`}>
                            <div className="font-semibold">{user?.name}</div>
                            <p className="text-sm text-muted-foreground">@{user?.handle}</p>
                        </Link>
                        <div className="mt-2">
                            {user?.subscription?.status === "active" || user?.manualMember ? (
                                <Link href={`/circles/${user?.handle}/settings/subscription`}>
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                        <img
                                            src="/images/member-badge.png"
                                            alt="Member Badge"
                                            className="mr-1 h-4 w-4"
                                        />
                                        Founding Member
                                    </span>
                                </Link>
                            ) : (
                                <Link href={`/circles/${user?.handle}/settings/subscription`}>
                                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                        Free Member
                                    </span>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as UserToolboxTab | undefined)}
                    className="flex h-full flex-col"
                >
                    <TabsList className="grid h-auto w-full grid-cols-8 rounded-none border-b border-t-0 border-b-slate-200 border-t-slate-200 bg-white p-0 pb-2 pt-0">
                        {/* Existing TabsTriggers */}
                        <TabsTrigger
                            value="chat"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <MessageCircle className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="notifications"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <Bell className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="circles"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <CircleIcon className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="contacts"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <Users className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="account"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <MdOutlineLogout className="h-5 w-5" />
                        </TabsTrigger>
                        {/* ... other tabs */}
                    </TabsList>
                    <TabsContent value="chat" className="m-0 flex-grow overflow-auto pt-1">
                        <ChatList chats={user?.chatRoomMemberships?.map((m) => m.chatRoom) || []} />
                    </TabsContent>
                    <TabsContent value="notifications" className="m-0 flex-grow overflow-auto pt-1">
                        <Notifications />
                    </TabsContent>
                    <TabsContent value="circles" className="m-0 flex-grow overflow-auto pt-1">
                        {circles.length > 0 ? (
                            circles.map((circle) => (
                                <div
                                    key={circle._id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => openCircle(circle)}
                                >
                                    <CirclePicture circle={circle} size="40px" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{circle.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {circle.description ?? circle.mission}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No communities followed
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="contacts" className="m-0 flex-grow overflow-auto pt-1">
                        {contacts.length > 0 ? (
                            contacts.map((contact) => (
                                <div
                                    key={contact._id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => openCircle(contact)}
                                >
                                    <CirclePicture circle={contact} size="40px" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{contact.name}</p>
                                        <p className="text-xs text-muted-foreground">{contact.description}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No followers
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="account" className="m-0 flex-grow overflow-auto pt-1">
                        <div className="flex h-full items-center justify-center pt-4">
                            <Button variant="outline" size="sm" onClick={signOut}>
                                Sign Out
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

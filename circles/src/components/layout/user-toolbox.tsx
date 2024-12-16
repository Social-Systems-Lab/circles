//user-toolbox.tsx
"use client";

import React, { Dispatch, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Bell,
    MessageCircle,
    Calendar,
    Edit,
    CheckSquare,
    BarChart2,
    Users,
    ArrowLeft,
    Circle as CircleIcon,
} from "lucide-react";
import { MdOutlineLogout } from "react-icons/md";
import {
    authInfoAtom,
    contentPreviewAtom,
    sidePanelContentVisibleAtom,
    userAtom,
    userToolboxDataAtom,
    matrixUserCacheAtom,
    latestMessagesAtom,
    unreadCountsAtom,
} from "@/lib/data/atoms";
import { SetStateAction, useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { fetchMatrixUsers } from "@/components/modules/chat/actions"; // Adjust the import path
import {
    ChatMessage,
    ChatRoom,
    Circle,
    ContentPreviewData,
    MatrixUserCache,
    MemberDisplay,
    UserPrivate,
    UserToolboxTab,
} from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { ChatRoomComponent, fetchAndCacheMatrixUsers, LatestMessage, MessageRenderer } from "../modules/chat/chat-room";
import { logOut } from "../auth/actions";
import { fetchJoinedRooms, fetchRoomDetails, fetchRoomMessages } from "@/lib/data/client-matrix";
import { getCircleAction } from "./actions";

type Notification = {
    id: number;
    message: string;
    time: string;
};

export const UserToolbox = () => {
    const [user, setUser] = useAtom(userAtom);
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [tab, setTab] = useState<UserToolboxTab | undefined>(undefined);
    const [selectedChat, setSelectedChat] = useState<ChatRoom | undefined>(undefined);
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);
    const [latestMessages, setLatestMessages] = useAtom(latestMessagesAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);

    const router = useRouter();

    useEffect(() => {
        if (!userToolboxState?.tab) {
            setTab("chat");
        } else {
            setTab(userToolboxState.tab === "profile" ? "chat" : userToolboxState.tab);
        }
    }, [userToolboxState?.tab]);

    const handleChatClick = async (chat: ChatRoom) => {
        const response = await getCircleAction(chat.circleId);
        let circle = response.circle;
        let path = "";
        if (circle.handle === "default") {
            path = `/chat${chat.handle && chat.handle !== "default" ? `/${chat.handle}` : ""}`;
        } else {
            path = `/circles/${circle.handle}/chat${chat.handle && chat.handle !== "default" ? `/${chat.handle}` : ""}`;
        }

        // navigate to chat
        router.push(path);
    };

    const openCircle = (circle: Circle) => {
        router.push(`/circles/${circle.handle}`);
    };

    const circles =
        user?.memberships?.filter((m) => m.circle.circleType !== "user")?.map((membership) => membership.circle) || [];
    const contacts =
        user?.memberships
            ?.filter((m) => m.circle.circleType === "user" && m.circle._id !== user?._id)
            ?.map((membership) => membership.circle) || [];

    const [chats, setChats] = useState<ChatRoom[]>([]);

    useEffect(() => {
        if (!user?.matrixAccessToken) return;

        console.log("User chat memberships", user?.chatRoomMemberships);
        setChats(user.chatRoomMemberships.map((m) => m.chatRoom));
    }, [user?.chatRoomMemberships, user?.matrixAccessToken]);

    const notifications: Notification[] = [
        // { id: 1, message: "John Doe has requested membership in a circle", time: "2 min ago" },
        // { id: 2, message: "Jane Smith has requested to join as a friend", time: "1 hour ago" },
        // { id: 3, message: "Alex Johnson has liked your post", time: "3 hours ago" },
    ];

    const handleCircleClick = (circle: MemberDisplay) => {
        let contentPreviewData: any = {
            type: "member",
            content: circle,
        };
        setContentPreview((x) =>
            x?.content === circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    // Sort chat rooms by latest message timestamp
    const sortedChats = useMemo(() => {
        if (!user?.chatRoomMemberships) return;

        const chats = user.chatRoomMemberships.map((m) => m.chatRoom);
        const sorted = chats.sort((a, b) => {
            const messageA = Object.entries(latestMessages).find(([key]) => key.startsWith(a.matrixRoomId!))?.[1];
            const messageB = Object.entries(latestMessages).find(([key]) => key.startsWith(b.matrixRoomId!))?.[1];

            const latestA = messageA?.origin_server_ts || 0;
            const latestB = messageB?.origin_server_ts || 0;
            return latestB - latestA; // Sort descending by timestamp
        });

        return sorted;
    }, [user?.chatRoomMemberships, latestMessages]);

    const signOut = () => {
        setAuthInfo({ ...authInfo, authStatus: "unauthenticated" });
        setUser(undefined);
        // close the toolbox
        setUserToolboxState(undefined);

        // clear the user data and redirect to the you've been signed out
        logOut();

        router.push("/");
    };

    if (userToolboxState === undefined) return null;

    return (
        <Card className="h-full overflow-auto border-0">
            <CardHeader className="p-4">
                <div className="flex items-center space-x-4">
                    <Avatar className="h-12 w-12">
                        <AvatarImage
                            src={user?.picture?.url || "/placeholder.svg?height=48&width=48"}
                            alt={user?.name}
                        />
                        <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="font-semibold">{user?.name}</div>
                        <p className="text-sm text-muted-foreground">@{user?.handle}</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as UserToolboxTab | undefined)}
                    className="flex h-full flex-col"
                >
                    <TabsList className="grid h-auto w-full grid-cols-7 rounded-none border-b border-t-0 border-b-slate-200 border-t-slate-200 bg-white p-0 pb-2 pt-0">
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
                        {!authInfo.inSsiApp && (
                            <TabsTrigger
                                value="account"
                                className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                            >
                                <MdOutlineLogout className="h-5 w-5" />
                            </TabsTrigger>
                        )}

                        {/* ... other tabs */}
                    </TabsList>
                    <TabsContent value="chat" className="m-0 flex-grow overflow-auto pt-1">
                        {sortedChats && sortedChats.length > 0 ? (
                            sortedChats.map((chat) => {
                                const unreadCountInRoom = Object.entries(unreadCounts).find(([key]) =>
                                    key.startsWith(chat.matrixRoomId!),
                                )?.[1];
                                const unreadCount = unreadCountInRoom || 0;
                                return (
                                    <div
                                        key={chat._id}
                                        className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                        onClick={() => handleChatClick(chat)}
                                    >
                                        <div className="relative">
                                            <CirclePicture
                                                circle={{ name: chat.name, picture: chat.picture }}
                                                size="40px"
                                            />
                                            {unreadCount > 0 && (
                                                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{chat.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                <LatestMessage
                                                    roomId={chat.matrixRoomId!}
                                                    latestMessages={latestMessages}
                                                />
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No chat rooms joined
                            </div>
                        )}
                        {/* <pre>
                            {JSON.stringify(
                                {
                                    unreadCounts,
                                },
                                null,
                                2,
                            )}
                        </pre> */}
                    </TabsContent>
                    <TabsContent value="notifications" className="m-0 flex-grow overflow-auto pt-1">
                        {notifications.length > 0 ? (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className="m-1 cursor-pointer rounded-lg p-2 hover:bg-gray-100"
                                >
                                    <p className="text-sm">{notification.message}</p>
                                    <p className="text-xs text-muted-foreground">{notification.time}</p>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No notifications
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="circles" className="m-0 flex-grow overflow-auto pt-1">
                        {circles.length > 0 ? (
                            circles.map((circle) => (
                                <div
                                    key={circle._id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => handleCircleClick(circle as MemberDisplay)}
                                >
                                    <CirclePicture circle={circle} size="40px" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{circle.name}</p>
                                        <p className="text-xs text-muted-foreground">{circle.description}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => openCircle(circle)}>
                                        Open
                                    </Button>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No circles joined
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="contacts" className="m-0 flex-grow overflow-auto pt-1">
                        {contacts.length > 0 ? (
                            contacts.map((contact) => (
                                <div
                                    key={contact._id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => handleCircleClick(contact as MemberDisplay)}
                                >
                                    <CirclePicture circle={contact} size="40px" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{contact.name}</p>
                                        <p className="text-xs text-muted-foreground">{contact.description}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => openCircle(contact)}>
                                        Open
                                    </Button>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No friends
                            </div>
                        )}
                    </TabsContent>
                    {!authInfo.inSsiApp && (
                        <TabsContent value="account" className="m-0 flex-grow overflow-auto pt-1">
                            <div className="flex h-full items-center justify-center pt-4">
                                <Button variant="outline" size="sm" onClick={signOut}>
                                    Sign Out
                                </Button>
                            </div>
                        </TabsContent>
                    )}
                </Tabs>
            </CardContent>
        </Card>
    );
};

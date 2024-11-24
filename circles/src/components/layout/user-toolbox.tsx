"use client";

import React, { useEffect, useState } from "react";
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
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { getChatMessagesAction } from "@/components/modules/chat/actions"; // Adjust the import path
import {
    ChatMessageDisplay,
    ChatRoom,
    Circle,
    ContentPreviewData,
    MemberDisplay,
    UserToolboxTab,
} from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { ChatRoomComponent } from "../modules/chat/chat-room";
import { logOut } from "../auth/actions";

type ChatRoomPreview = {
    id: string;
    name: string;
    message: string;
    avatar: string;
    status: string;
    circle: Circle;
    chatRoom: ChatRoom;
};

type Notification = {
    id: number;
    message: string;
    time: string;
};

export const UserToolbox = () => {
    const [user, setUser] = useAtom(userAtom);
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [tab, setTab] = useState<UserToolboxTab | undefined>(undefined);
    const [selectedChat, setSelectedChat] = useState<ChatRoomPreview | undefined>(undefined);
    const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);

    const router = useRouter();

    useEffect(() => {
        console.log("UserToolboxState", tab, "->", userToolboxState?.tab);
        if (!userToolboxState?.tab) {
            setTab("chat");
        } else {
            setTab(userToolboxState.tab === "profile" ? "chat" : userToolboxState.tab);
        }
    }, [userToolboxState?.tab]);

    const handleChatClick = async (chat: ChatRoomPreview) => {
        setIsLoadingMessages(true);
        try {
            // Fetch messages using the chatRoom and circle IDs
            const fetchedMessages = await getChatMessagesAction(chat.chatRoom._id, chat.circle._id, 20, 0);
            setMessages(fetchedMessages);
            setSelectedChat(chat);
        } catch (error) {
            console.error("Failed to fetch chat messages:", error);
        } finally {
            setIsLoadingMessages(false);
        }
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

    // Prepare the chats list
    const chats: ChatRoomPreview[] =
        user?.chatRoomMemberships?.map((chatRoomMembership) => {
            const chatRoom = chatRoomMembership.chatRoom;
            const circleId = chatRoom.circleId;

            // Find the circle from user memberships
            const circleMembership = user.memberships?.find((membership) => membership.circle._id === circleId);
            const circle = circleMembership?.circle;

            return {
                id: chatRoom._id,
                name: chatRoom.name || circle?.name || "Unknown",
                message: "", // Placeholder for the last message
                avatar: circle?.picture?.url || "/placeholder.svg",
                status: "", // Placeholder for status
                circle: circle || {}, // Ensure circle is defined
                chatRoom,
            };
        }) || [];

    const notifications: Notification[] = [
        // { id: 1, message: "John Doe has requested membership in a circle", time: "2 min ago" },
        // { id: 2, message: "Jane Smith has requested to join as a friend", time: "1 hour ago" },
        // { id: 3, message: "Alex Johnson has liked your post", time: "3 hours ago" },
    ];

    const handleCircleClick = (circle: MemberDisplay) => {
        let contentPreviewData: ContentPreviewData = {
            type: "member",
            content: circle,
        };
        setContentPreview((x) =>
            x?.content === circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const signOut = () => {
        // clear the user data and redirect to the you've been signed out
        logOut();
        setUser(undefined);
        setAuthInfo({ ...authInfo, authStatus: "unauthenticated" });
        // close the toolbox
        setUserToolboxState(undefined);

        router.push("/logged-out");
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
                <Tabs value={tab} onValueChange={(v) => setTab(v)} className="flex h-full flex-col">
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
                        {selectedChat ? (
                            <div className="flex h-full flex-col">
                                {/* Header with Back Button */}
                                <div className="flex items-center border-b p-2">
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedChat(undefined)}>
                                        <ArrowLeft className="h-5 w-5" />
                                    </Button>
                                    <div className="ml-2 flex items-center space-x-2">
                                        <Avatar>
                                            <AvatarImage src={selectedChat.avatar} alt={selectedChat.name} />
                                            <AvatarFallback>{selectedChat.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-sm font-medium">{selectedChat.name}</p>
                                            <p className="text-xs text-muted-foreground">{selectedChat.status}</p>
                                        </div>
                                    </div>
                                </div>
                                {/* Chat Room Component */}
                                {isLoadingMessages ? (
                                    <div className="flex h-full items-center justify-center">Loading messages...</div>
                                ) : (
                                    <ChatRoomComponent
                                        circle={selectedChat.circle}
                                        chatRoom={selectedChat.chatRoom}
                                        initialMessages={messages}
                                        inToolbox={true}
                                    />
                                )}
                            </div>
                        ) : /* Chat List */
                        chats.length > 0 ? (
                            chats.map((chat) => (
                                <div
                                    key={chat.id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => handleChatClick(chat)}
                                >
                                    <CirclePicture circle={chat.circle} size="40px" />
                                    <div>
                                        <p className="text-sm font-medium">{chat.name}</p>
                                        <p className="text-xs text-muted-foreground">{chat.message}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                No chat rooms joined
                            </div>
                        )}
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
                                    onClick={() => handleCircleClick(circle)}
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
                                    onClick={() => handleCircleClick(contact)}
                                >
                                    <CirclePicture circle={contact} size="40px" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{contact.name}</p>
                                        <p className="text-xs text-muted-foreground">{contact.description}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => openCircle(circle)}>
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

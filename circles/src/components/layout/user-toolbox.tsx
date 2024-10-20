"use client";

import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, MessageCircle, Calendar, Edit, CheckSquare, BarChart2 } from "lucide-react";
import { userAtom, userToolboxDataAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { UserToolboxData, UserToolboxTab } from "@/models/models";

type ChatRoomPreview = {
    id: number;
    name: string;
    message: string;
    avatar: string;
    status: string;
};

export const UserToolbox = () => {
    const [user] = useAtom(userAtom);
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [tab, setTab] = useState<UserToolboxTab>("chat");

    // const onLogOutClick = async () => {
    //     startTransition(async () => {
    //         await logOut();
    //         setAuthenticated(false);
    //         setUser(undefined);

    //         let redirectTo = pathname ?? "/";
    //         router.push("/logged-out?redirectTo=" + redirectTo);
    //     });
    // };

    useEffect(() => {
        if (!userToolboxState) {
            setTab("chat");
        } else {
            setTab(userToolboxState.tab === "profile" ? "chat" : userToolboxState.tab);
        }
    }, [userToolboxState]);

    const handleChatClick = (chat: ChatRoomPreview) => {
        console.log(chat);
    };

    const notifications = [
        { id: 1, message: "John Doe has requested membership in a circle", time: "2 min ago" },
        { id: 2, message: "Jane Smith has requested to join as a friend", time: "1 hour ago" },
        { id: 3, message: "Alex Johnson has liked your post", time: "3 hours ago" },
    ];

    const chats = [
        {
            id: 1,
            name: "Eva Opacic",
            message: "Hey there!",
            avatar: "/placeholder.svg?height=40&width=40",
            status: "Active 5m ago",
        },
        {
            id: 2,
            name: "Marie Börjesson",
            message: "Let's catch up.",
            avatar: "/placeholder.svg?height=40&width=40",
            status: "Active 2h ago",
        },
        {
            id: 3,
            name: "Johan Nordvik",
            message: "How are you?",
            avatar: "/placeholder.svg?height=40&width=40",
            status: "Active 1h ago",
        },
    ];

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
                <Tabs value={tab} onValueChange={(v) => setTab(v as UserToolboxTab)} className="flex h-full flex-col">
                    <TabsList className="grid h-auto w-full grid-cols-6 rounded-none border-b border-t-0 border-b-slate-200 border-t-slate-200 bg-white p-0 pb-2 pt-0">
                        <TabsTrigger
                            value="chat"
                            className={`data-[state=active]:bg-primaryLight m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <MessageCircle className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="notifications"
                            className={`data-[state=active]:bg-primaryLight m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <Bell className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="calendar"
                            className={`data-[state=active]:bg-primaryLight m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <Calendar className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="edit"
                            className={`data-[state=active]:bg-primaryLight m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <Edit className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="tasks"
                            className={`data-[state=active]:bg-primaryLight m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <CheckSquare className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="stats"
                            className={`data-[state=active]:bg-primaryLight m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <BarChart2 className="h-5 w-5" />
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="chat" className="m-0 flex-grow overflow-auto pt-1">
                        {chats.map((chat) => (
                            <div
                                key={chat.id}
                                className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                onClick={() => handleChatClick(chat)}
                            >
                                <Avatar>
                                    <AvatarImage src={chat.avatar} alt={chat.name} />
                                    <AvatarFallback>{chat.name[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm font-medium">{chat.name}</p>
                                    <p className="text-xs text-muted-foreground">{chat.message}</p>
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                    <TabsContent value="notifications" className="flex-grow overflow-auto p-4">
                        {notifications.map((notification) => (
                            <div key={notification.id} className="mb-4 cursor-pointer rounded-lg p-2 hover:bg-gray-100">
                                <p className="text-sm">{notification.message}</p>
                                <p className="text-xs text-muted-foreground">{notification.time}</p>
                            </div>
                        ))}
                    </TabsContent>
                    {/* Other tabs content can be added here */}
                </Tabs>
            </CardContent>
        </Card>
    );
};

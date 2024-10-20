"use client";

import React, { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "../ui/button";
import { logOut } from "../auth/actions";
import { userAtom, authenticatedAtom } from "@/lib/data/atoms";
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

type ChatRoomPreview = {
    id: number;
    name: string;
    message: string;
    avatar: string;
    status: string;
};

const ProfileMenuBar = () => {
    const router = useRouter();
    const pathname = usePathname();
    const [authenticated, setAuthenticated] = useAtom(authenticatedAtom);
    const [user, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const searchParams = useSearchParams();

    const onLogInClick = () => {
        let redirectTo = searchParams.get("redirectTo") ?? "/";
        router.push("/login?redirectTo=" + redirectTo);
    };

    const onSignUpClick = () => {
        let redirectTo = searchParams.get("redirectTo");
        router.push("/signup?redirectTo=" + redirectTo);
    };

    const onLogOutClick = async () => {
        startTransition(async () => {
            await logOut();
            setAuthenticated(false);
            setUser(undefined);

            let redirectTo = pathname ?? "/";
            router.push("/logged-out?redirectTo=" + redirectTo);
        });
    };

    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // State variables for notifications and chats
    const [activeTab, setActiveTab] = useState("chat");
    const [openChats, setOpenChats] = useState<ChatRoomPreview[]>([]);
    const [minimizedChats, setMinimizedChats] = useState<ChatRoomPreview[]>([]);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const notifications = [
        { id: 1, message: "John Doe has requested membership in a circle", time: "2 min ago" },
        { id: 2, message: "Jane Smith has requested to join as a friend", time: "1 hour ago" },
        { id: 3, message: "Alex Johnson has liked your post", time: "3 hours ago" },
    ];

    const chats: ChatRoomPreview[] = [
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

    const handleChatClick = (chat: ChatRoomPreview) => {
        setIsPopoverOpen(false);
        if (openChats.find((c) => c.id === chat.id)) {
            // If chat is already open, bring it to the front
            setOpenChats([...openChats.filter((c) => c.id !== chat.id), chat]);
        } else {
            // Minimize currently open chat, if any
            if (openChats.length > 0) {
                const currentChat = openChats[openChats.length - 1];
                setMinimizedChats([...minimizedChats, currentChat]);
                setOpenChats([chat]);
            } else {
                setOpenChats([...openChats, chat]);
            }
        }
        setMinimizedChats(minimizedChats.filter((c) => c.id !== chat.id));
    };

    const handleCloseChat = (chatId: number) => {
        setOpenChats(openChats.filter((chat) => chat.id !== chatId));
        setMinimizedChats(minimizedChats.filter((chat) => chat.id !== chatId));
    };

    const handleMinimizeChat = (chat: ChatRoomPreview) => {
        setOpenChats(openChats.filter((c) => c.id !== chat.id));
        setMinimizedChats([...minimizedChats, chat]);
    };

    const handleMaximizeChat = (chat: ChatRoomPreview) => {
        setMinimizedChats(minimizedChats.filter((c) => c.id !== chat.id));
        handleChatClick(chat);
    };

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-1 overflow-hidden">
            {authenticated && user && (
                <>
                    <div className="flex items-center space-x-2">
                        {/* Chat icon with Popover */}
                        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                                >
                                    <MessageCircle className="h-5 w-5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="mr-4 w-80 rounded-[15px] p-0"
                                style={{ height: "calc(100vh - 100px)" }}
                            >
                                <NotificationPanel activeTab="chat" handleChatClick={handleChatClick} user={user} />
                            </PopoverContent>
                        </Popover>
                        {/* Bell icon with Popover */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                                >
                                    <Bell className="h-5 w-5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="mr-4 w-80 rounded-[15px] p-0"
                                style={{ height: "calc(100vh - 100px)" }}
                            >
                                <NotificationPanel
                                    activeTab="notifications"
                                    handleChatClick={handleChatClick}
                                    user={user}
                                />
                            </PopoverContent>
                        </Popover>
                        {/* Profile picture with DropdownMenu */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button className="h-auto w-auto rounded-full p-0" variant="ghost">
                                    <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="mr-4 w-[400px] rounded-[15px] p-0"
                                style={{ height: "calc(100vh - 70px)" }}
                            >
                                <NotificationPanel
                                    activeTab="notifications"
                                    handleChatClick={handleChatClick}
                                    user={user}
                                />
                                {/* 
                                <Link href={`/circles/${user?.handle}`}>
                                    <div className="flex w-[160px] flex-col items-center justify-center pt-4">
                                        <UserPicture name={user?.name} picture={user?.picture?.url} size="108px" />
                                        <span className="text-md pb-4 pt-4 font-bold">{user?.name}</span>
                                    </div>
                                </Link>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={onLogOutClick}>
                                    <HiOutlineLogout className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem> */}
                            </PopoverContent>
                        </Popover>
                    </div>
                    {/* Minimized Chats */}
                    <div className="fixed bottom-0 right-0 flex space-x-2 p-4">
                        {minimizedChats.map((chat) => (
                            <div key={chat.id} className="relative">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="rounded-full"
                                    onClick={() => handleMaximizeChat(chat)}
                                >
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={chat.avatar} alt={chat.name} />
                                        <AvatarFallback>{chat.name[0]}</AvatarFallback>
                                    </Avatar>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white opacity-0 transition-opacity hover:bg-gray-200 hover:opacity-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCloseChat(chat.id);
                                    }}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    {/* Open Chats */}
                    <div
                        className="fixed bottom-0 right-0 flex space-x-2 p-4"
                        style={{ right: `${minimizedChats.length * 48 + 16}px` }}
                    >
                        {openChats.map((chat) => (
                            <ChatWindow
                                key={chat.id}
                                chat={chat}
                                onClose={() => handleCloseChat(chat.id)}
                                onMinimize={() => handleMinimizeChat(chat)}
                            />
                        ))}
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

function NotificationPanel({ activeTab, handleChatClick, user }) {
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
                        <CardTitle>{user?.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{user?.handle}</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs defaultValue={activeTab} className="flex h-full flex-col">
                    <TabsList className="grid h-auto w-full grid-cols-6 p-0">
                        <TabsTrigger value="chat" className="rounded-full p-2">
                            <MessageCircle className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger value="notifications" className="rounded-full p-2">
                            <Bell className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="rounded-full p-2">
                            <Calendar className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger value="edit" className="rounded-full p-2">
                            <Edit className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger value="tasks" className="rounded-full p-2">
                            <CheckSquare className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger value="stats" className="rounded-full p-2">
                            <BarChart2 className="h-5 w-5" />
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="chat" className="flex-grow overflow-auto p-4">
                        {chats.map((chat) => (
                            <div
                                key={chat.id}
                                className="mb-4 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
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
}

function ChatWindow({ chat, onClose, onMinimize }) {
    return (
        <Card className="w-80 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between p-3">
                <div className="flex items-center space-x-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={chat.avatar} alt={chat.name} />
                        <AvatarFallback>{chat.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle className="text-sm">{chat.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{chat.status}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Video className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMinimize}>
                        <Minus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="h-80 overflow-y-auto p-3">
                {/* Chat messages would go here */}
                {/* Sample messages */}
            </CardContent>
            <div className="border-t p-3">
                <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Paperclip className="h-4  w-4" />
                    </Button>
                    <Input placeholder="Type a message" className="flex-grow" />
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Smile className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </Card>
    );
}

export const ProfileMenu = () => {
    return (
        <Suspense>
            <ProfileMenuBar />
        </Suspense>
    );
};

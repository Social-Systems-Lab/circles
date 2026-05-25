//user-toolbox.tsx - Displays the user toolbox that contains the user's chat rooms, notifications, circles, contacts, and account settings
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Bookmark, ChevronDown, Circle as CircleIcon, Loader2, Pin, PinOff, Users } from "lucide-react";
import { LuClipboardCheck, LuMail } from "react-icons/lu";
import {
    authInfoAtom,
    userAtom,
    userToolboxDataAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter, usePathname } from "next/navigation";
import { Circle, UserToolboxTab, EventDisplay, ChatRoomDisplay } from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { logOut } from "../auth/actions";
import { VerifyAccountButton } from "../modules/auth/verify-account-button";
import { Notifications } from "./notifications";
import Link from "next/link";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useIsMobile } from "../utils/use-is-mobile";
import { ChatList } from "../modules/chat/chat-list";
import EventTimeline from "../modules/events/event-timeline";
import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
import { getIssuesAction } from "@/app/circles/[handle]/issues/actions";
import { listChatRoomsAction } from "@/components/modules/chat/actions";
import {
    acceptConnectRequestAction,
    declineConnectRequestAction,
    getBookmarkedCirclesAction,
    listToolboxConnectionsAction,
    pinCircleAction,
    unpinCircleAction,
} from "@/components/modules/home/actions";
const { flushSync } = require("react-dom");
import { LoadingSpinner } from "../ui/loading-spinner";
import { useToast } from "../ui/use-toast";
import { getCircleDefaultPath } from "@/lib/utils/circle-routes";

type Milestone = { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string; circleHandle?: string };
type ToolboxTab = UserToolboxTab | "connections";
type ToolboxConnectionItem = {
    circle: Circle;
    connectStatus: "accepted" | "pending_sent" | "pending_received";
    updatedAt: Date | string;
};
type BookmarkedItem = {
    id: string;
    circleId: string;
    name: string;
    type: string;
    href: string;
    pinned: boolean;
    description?: string;
};

const toolboxActiveTabClassName =
    "m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 text-[#696969] transition-colors hover:text-[#2d6a45] data-[state=active]:bg-[#e4f1e8] data-[state=active]:text-[#2d6a45] data-[state=active]:shadow-sm";

export const UserToolbox = () => {
    const [user, setUser] = useAtom(userAtom);
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [tab, setTab] = useState<ToolboxTab>("chat");
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);
    const pathname = usePathname();
    const [prevPath, setPrevPath] = useState(pathname);
    const isMobile = useIsMobile();

    const router = useRouter();
    const { toast } = useToast();

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
        closeToolbox();
        router.push(getCircleDefaultPath(circle));
    };

    const circles =
        user?.memberships
            ?.filter((m) => m.circle.circleType === "circle" && m.circle.handle !== "default")
            ?.map((membership) => membership.circle) || [];

    const [events, setEvents] = useState<EventDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [chatRooms, setChatRooms] = useState<ChatRoomDisplay[]>([]);
    const [bookmarkedItems, setBookmarkedItems] = useState<BookmarkedItem[]>([]);
    const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(true);
    const [bookmarkActionCircleId, setBookmarkActionCircleId] = useState<string | null>(null);
    const [connections, setConnections] = useState<{
        accepted: ToolboxConnectionItem[];
        pendingIncoming: ToolboxConnectionItem[];
        pendingOutgoing: ToolboxConnectionItem[];
    }>({
        accepted: [],
        pendingIncoming: [],
        pendingOutgoing: [],
    });
    const [isLoadingConnections, setIsLoadingConnections] = useState(true);
    const [respondingConnectionDid, setRespondingConnectionDid] = useState<string | null>(null);
    const handleToolboxEventHidden = useCallback(
        (eventId: string) => {
            if (!eventId) return;
            setEvents((prev) =>
                prev.filter((evt) => {
                    const id = ((evt as any)._id?.toString?.() || (evt as any)._id || "") as string;
                    return id !== eventId;
                }),
            );
        },
        [setEvents],
    );

    useEffect(() => {
        const fetchTimelineItems = async () => {
            if (!user?.handle) {
                setEvents([]);
                setMilestones([]);
                return;
            }

            try {
                const today = new Date();
                const nextYear = new Date(today);
                nextYear.setFullYear(today.getFullYear() + 1);

                const results = await Promise.allSettled([
                    getEventsAction(
                        user.handle,
                        { from: today.toISOString(), to: nextYear.toISOString() },
                        true,
                        true,
                    ),
                    getGoalsAction(user.handle, true, true),
                    getTasksAction(user.handle, true, true),
                    getIssuesAction(user.handle, true, true),
                ] as const);

                const eventsRes = results[0].status === "fulfilled" ? results[0].value : undefined;
                const goalsRes = results[1].status === "fulfilled" ? results[1].value : undefined;
                const tasksRes = results[2].status === "fulfilled" ? results[2].value : undefined;
                const issuesRes = results[3].status === "fulfilled" ? results[3].value : undefined;

                setEvents(eventsRes?.events ?? []);

                const goalMilestones: Milestone[] =
                    (goalsRes?.goals || [])
                        .filter((goal: any) => goal?.targetDate)
                        .map((goal: any) => ({
                            id: (goal as any)._id?.toString?.() || goal._id,
                            type: "goal" as const,
                            title: goal.title,
                            date: goal.targetDate,
                        })) || [];

                const taskMilestones: Milestone[] =
                    (tasksRes?.tasks || [])
                        .filter(
                            (task: any) =>
                                task?.targetDate &&
                                task?.stage !== "resolved" &&
                                (task?.assignedTo === user?.did ||
                                    ((task?.taskType ?? "outcome") === "shift" &&
                                        (task?.participants || []).some(
                                            (participant: any) => participant?.userDid === user?.did,
                                        ))),
                        )
                        .map((task: any) => ({
                            id: (task as any)._id?.toString?.() || task._id,
                            type: "task" as const,
                            title: task.title,
                            date: task.targetDate,
                            circleHandle: task.circle?.handle,
                        })) || [];

                const issueMilestones: Milestone[] =
                    (issuesRes || [])
                        .filter((issue: any) => issue?.targetDate)
                        .map((issue: any) => ({
                            id: (issue as any)._id?.toString?.() || issue._id,
                            type: "issue" as const,
                            title: issue.title,
                            date: issue.targetDate,
                        })) || [];

                setMilestones([...goalMilestones, ...taskMilestones, ...issueMilestones]);
            } catch (e) {
                console.error("Failed to load toolbox timeline items", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTimelineItems();
    }, [user?.handle]);

    useEffect(() => {
        let isMounted = true;
        const loadRooms = async () => {
            if (!user) {
                if (isMounted) setChatRooms([]);
                return;
            }
            try {
                const result = await listChatRoomsAction();
                if (isMounted && result.success && result.rooms) {
                    setChatRooms(result.rooms);
                }
            } catch (error) {
                console.error("Failed to load chat rooms:", error);
            }
        };

        loadRooms();
        return () => {
            isMounted = false;
        };
    }, [user]);

    useEffect(() => {
        let isMounted = true;

        const loadBookmarks = async () => {
            if (!user?.did) {
                if (isMounted) {
                    setBookmarkedItems([]);
                    setIsLoadingBookmarks(false);
                }
                return;
            }

            try {
                const circles = await getBookmarkedCirclesAction();
                if (!isMounted) return;

                const pinnedIds = user.pinnedCircles ?? [];
                const orderedCircles = [...circles].sort((a, b) => {
                    const aId = a._id?.toString() ?? "";
                    const bId = b._id?.toString() ?? "";
                    const aPinnedIndex = pinnedIds.indexOf(aId);
                    const bPinnedIndex = pinnedIds.indexOf(bId);

                    if (aPinnedIndex !== -1 || bPinnedIndex !== -1) {
                        if (aPinnedIndex === -1) return 1;
                        if (bPinnedIndex === -1) return -1;
                        return aPinnedIndex - bPinnedIndex;
                    }

                    return (a.name ?? "").localeCompare(b.name ?? "");
                });

                setBookmarkedItems(
                    orderedCircles.map((circle) => ({
                        id: circle._id?.toString() ?? circle.handle ?? circle.did ?? getCircleDefaultPath(circle),
                        circleId: circle._id?.toString() ?? "",
                        name: circle.name || circle.handle || "Untitled bookmark",
                        type: circle.circleType === "user" ? "Profile" : circle.circleType === "project" ? "Project" : "Circle",
                        href: getCircleDefaultPath(circle),
                        pinned: pinnedIds.includes(circle._id?.toString() ?? ""),
                        description: circle.description ?? circle.mission,
                    })),
                );
            } catch (error) {
                console.error("Failed to load bookmarked items:", error);
                if (isMounted) {
                    setBookmarkedItems([]);
                }
            } finally {
                if (isMounted) {
                    setIsLoadingBookmarks(false);
                }
            }
        };

        setIsLoadingBookmarks(true);
        void loadBookmarks();

        return () => {
            isMounted = false;
        };
    }, [user?.did, user?.bookmarkedCircles, user?.pinnedCircles]);

    useEffect(() => {
        let isMounted = true;

        const loadConnections = async () => {
            if (!user?.did) {
                if (isMounted) {
                    setConnections({
                        accepted: [],
                        pendingIncoming: [],
                        pendingOutgoing: [],
                    });
                    setIsLoadingConnections(false);
                }
                return;
            }

            try {
                const result = await listToolboxConnectionsAction();
                if (isMounted) {
                    setConnections(result);
                }
            } catch (error) {
                console.error("Failed to load toolbox connections:", error);
                if (isMounted) {
                    setConnections({
                        accepted: [],
                        pendingIncoming: [],
                        pendingOutgoing: [],
                    });
                }
            } finally {
                if (isMounted) {
                    setIsLoadingConnections(false);
                }
            }
        };

        setIsLoadingConnections(true);
        void loadConnections();

        return () => {
            isMounted = false;
        };
    }, [user?.did]);

    const closeToolbox = useCallback(() => {
        setUserToolboxState(undefined);
    }, [setUserToolboxState]);

    const handleTimelineNavigate = useCallback(() => {
        flushSync(() => {
            closeToolbox();
        });
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0 });
        }
    }, [closeToolbox]);

    const handleEventNavigate = useCallback(() => {
        flushSync(() => {
            closeToolbox();
        });
        // Do not scroll to top as we use hash navigation for events
    }, [closeToolbox]);

    const signOut = async () => {
        // clear the user data and redirect to the you've been signed out
        await logOut();

        setAuthInfo({ ...authInfo, authStatus: "unauthenticated" });
        setUser(undefined);
        // close the toolbox
        closeToolbox();

        router.push("/welcome");
    };

    const openConnection = useCallback(
        (connection: ToolboxConnectionItem) => {
            closeToolbox();
            router.push(`/circles/${connection.circle.handle}`);
        },
        [closeToolbox, router],
    );

    const handleConnectionResponse = useCallback(
        async (connection: ToolboxConnectionItem, response: "accept" | "decline") => {
            const targetDid = connection.circle.did;
            if (!targetDid || respondingConnectionDid === targetDid) {
                return;
            }

            setRespondingConnectionDid(targetDid);

            try {
                const result =
                    response === "accept"
                        ? await acceptConnectRequestAction(targetDid)
                        : await declineConnectRequestAction(targetDid);

                if (!result.success) {
                    toast({
                        title: "Unable to respond",
                        description: result.message,
                        variant: "destructive",
                    });
                    return;
                }

                setConnections((prev) => {
                    const pendingIncoming = prev.pendingIncoming.filter((item) => item.circle.did !== targetDid);

                    if (response === "decline") {
                        return {
                            ...prev,
                            pendingIncoming,
                        };
                    }

                    const accepted = [
                        ...prev.accepted.filter((item) => item.circle.did !== targetDid),
                        {
                            ...connection,
                            connectStatus: "accepted" as const,
                            updatedAt: new Date(),
                        },
                    ].sort((a, b) => (a.circle.name || "").localeCompare(b.circle.name || ""));

                    return {
                        ...prev,
                        accepted,
                        pendingIncoming,
                    };
                });
            } catch (error) {
                console.error(`Failed to ${response} contact request`, error);
                toast({
                    title: "Unable to respond",
                    description:
                        response === "accept"
                            ? "Failed to accept contact request"
                            : "Failed to decline contact request",
                    variant: "destructive",
                });
            } finally {
                setRespondingConnectionDid(null);
            }
        },
        [respondingConnectionDid, toast],
    );

    const handleBookmarkPinToggle = useCallback(
        async (item: BookmarkedItem) => {
            if (!item.circleId || bookmarkActionCircleId === item.circleId || !user) {
                return;
            }

            const previousUser = user;
            const nextPinned = item.pinned
                ? (previousUser.pinnedCircles ?? []).filter((id) => id !== item.circleId)
                : [item.circleId, ...(previousUser.pinnedCircles ?? []).filter((id) => id !== item.circleId)].slice(0, 5);

            setBookmarkActionCircleId(item.circleId);
            setUser({
                ...previousUser,
                pinnedCircles: nextPinned,
            });

            try {
                const updatedUser = item.pinned
                    ? await unpinCircleAction(item.circleId)
                    : await pinCircleAction(item.circleId);

                if (!updatedUser) {
                    setUser(previousUser);
                    toast({
                        title: "Unable to update pin",
                        description: item.pinned ? "Failed to remove bookmark pin." : "Failed to pin bookmark.",
                        variant: "destructive",
                    });
                    return;
                }

                setUser(updatedUser);
            } catch (error) {
                console.error("Failed to toggle bookmark pin", error);
                setUser(previousUser);
                toast({
                    title: "Unable to update pin",
                    description: item.pinned ? "Failed to remove bookmark pin." : "Failed to pin bookmark.",
                    variant: "destructive",
                });
            } finally {
                setBookmarkActionCircleId(null);
            }
        },
        [bookmarkActionCircleId, setUser, toast, user],
    );

    const renderConnectionRow = useCallback(
        (connection: ToolboxConnectionItem, label?: string) => {
            const showRespondControl = connection.connectStatus === "pending_received";
            const isResponding = respondingConnectionDid === connection.circle.did;

            return (
                <div
                    key={`${connection.connectStatus}-${connection.circle.did}`}
                    className="m-1 flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-100"
                    onClick={() => openConnection(connection)}
                >
                    <CirclePicture circle={connection.circle} size="40px" />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{connection.circle.name}</p>
                            {label ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {label}
                                </span>
                            ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                            {connection.circle.description ?? connection.circle.mission ?? `@${connection.circle.handle}`}
                        </p>
                    </div>
                    {showRespondControl ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 px-2 text-xs"
                                    disabled={isResponding}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    {isResponding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                                    Respond
                                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                                <DropdownMenuItem onSelect={() => void handleConnectionResponse(connection, "accept")}>
                                    Accept
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onSelect={() => void handleConnectionResponse(connection, "decline")}
                                >
                                    Decline
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            );
        },
        [handleConnectionResponse, openConnection, respondingConnectionDid],
    );

    const renderBookmarkRow = useCallback(
        (item: BookmarkedItem) => {
            const isUpdatingPin = bookmarkActionCircleId === item.circleId;
            const rowClassName = item.pinned
                ? "m-1 flex items-start gap-3 rounded-xl border border-[#c9d1a7] bg-[#f4f6e8] p-2.5 shadow-[0_1px_2px_rgba(92,107,48,0.08)] hover:bg-[#eef2dd]"
                : "m-1 flex items-start gap-3 rounded-lg p-2 hover:bg-gray-100";
            const iconWrapClassName = item.pinned
                ? "mt-0.5 rounded-full bg-[#dfe6bd] p-2 text-[#5d6b33]"
                : "mt-0.5 rounded-full bg-slate-100 p-2 text-slate-500";
            const pinButtonClassName = item.pinned
                ? "h-8 w-8 shrink-0 rounded-full border border-[#c9d1a7] bg-[#dfe6bd] text-[#5d6b33] hover:bg-[#d3dcae] hover:text-[#4f5d2b]"
                : "h-8 w-8 shrink-0 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700";

            return (
                <Link
                    key={item.id}
                    href={item.href}
                    className={rowClassName}
                    onClick={closeToolbox}
                >
                    <div className={iconWrapClassName}>
                        <Bookmark className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <span
                                className={
                                    item.pinned
                                        ? "rounded-full bg-[#dfe6bd] px-2 py-0.5 text-[11px] font-medium text-[#5d6b33]"
                                        : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                }
                            >
                                {item.type}
                            </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{item.description ?? item.href}</p>
                    </div>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={pinButtonClassName}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleBookmarkPinToggle(item);
                        }}
                        title={item.pinned ? "Unpin bookmark" : "Pin bookmark"}
                        aria-label={item.pinned ? "Unpin bookmark" : "Pin bookmark"}
                        disabled={isUpdatingPin}
                    >
                        {isUpdatingPin ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : item.pinned ? (
                            <PinOff className="h-4 w-4 fill-current" />
                        ) : (
                            <Pin className="h-4 w-4" />
                        )}
                    </Button>
                </Link>
            );
        },
        [bookmarkActionCircleId, closeToolbox, handleBookmarkPinToggle],
    );

    const handleTabChange = useCallback(
        (nextTab: string) => {
            setTab(nextTab as ToolboxTab);
        },
        [setTab],
    );

    const pinnedBookmarks = bookmarkedItems.filter((item) => item.pinned);
    const otherBookmarks = bookmarkedItems.filter((item) => !item.pinned);

    if (userToolboxState === undefined) return null;

    return (
        <Card className="h-full overflow-auto border-0">
            <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-3 pr-12">
                    <div className="flex min-w-0 flex-1 items-center space-x-4">
                        <Link href={`/circles/${user?.handle}`}>
                            <Avatar className="h-12 w-12">
                                <AvatarImage
                                    src={user?.picture?.url || "/placeholder.svg?height=48&width=48"}
                                    alt={user?.name}
                                />
                                <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                        </Link>
                        <div className="min-w-0">
                            <Link href={`/circles/${user?.handle}`}>
                                <div className="truncate font-semibold">{user?.name}</div>
                                <p className="truncate text-sm text-muted-foreground">@{user?.handle}</p>
                            </Link>
                            <div className="mt-2">
                                {user?.isMember ? (
                                    <Link href={`/circles/${user?.handle}/settings/subscription`}>
                                        <span className="inline-flex items-center rounded-full bg-[hsl(var(--founding-member-bg))] px-2 py-1 text-xs font-medium text-[hsl(var(--founding-member-foreground))]">
                                            <img
                                                src="/images/member-badge.png"
                                                alt="Member Badge"
                                                className="mr-1 h-4 w-4"
                                            />
                                            Founding Member
                                        </span>
                                    </Link>
                                ) : (
                                    <VerifyAccountButton />
                                )}
                            </div>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="shrink-0 bg-black text-white hover:bg-[#1f1f1f]"
                        onClick={() => void signOut()}
                    >
                        Sign out
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs
                    value={tab}
                    onValueChange={handleTabChange}
                    className="flex h-full flex-col"
                >
                    <TabsList className="grid h-auto w-full grid-cols-6 rounded-none border-b border-t-0 border-b-slate-200 border-t-slate-200 bg-white p-0 pb-2 pt-0">
                        {/* Existing TabsTriggers */}
                        <TabsTrigger
                            value="chat"
                            className={toolboxActiveTabClassName}
                        >
                            <LuMail className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="events"
                            className={toolboxActiveTabClassName}
                        >
                            <LuClipboardCheck className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="notifications"
                            className={toolboxActiveTabClassName}
                        >
                            <Bell className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="circles"
                            className={toolboxActiveTabClassName}
                        >
                            <CircleIcon className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="connections"
                            className={toolboxActiveTabClassName}
                        >
                            <Users className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="bookmarks"
                            className={toolboxActiveTabClassName}
                        >
                            <Bookmark className="h-5 w-5" />
                        </TabsTrigger>
                        {/* ... other tabs */}
                    </TabsList>
                    <TabsContent value="chat" className="m-0 flex-grow overflow-auto pt-1">
                        <ChatList
                            chats={chatRooms}
                            onChatClick={closeToolbox}
                        />
                    </TabsContent>
                    <TabsContent value="notifications" className="m-0 flex-grow overflow-auto pt-1">
                        <Notifications onNavigate={closeToolbox} />
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
                            <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                                No communities followed
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="bookmarks" className="m-0 flex-grow overflow-auto pt-1">
                        {isLoadingBookmarks ? (
                            <div className="flex flex-1 items-center justify-center">
                                <LoadingSpinner />
                            </div>
                        ) : bookmarkedItems.length > 0 ? (
                            <div className="pb-2">
                                <div className="flex items-center justify-between px-3 pb-2 pt-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Bookmarks
                                    </p>
                                    <Link
                                        href="/bookmarks"
                                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                                        onClick={closeToolbox}
                                    >
                                        View all
                                    </Link>
                                </div>
                                {pinnedBookmarks.length > 0 ? (
                                    <>
                                        <div className="px-3 pb-1 pt-1">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Pinned
                                            </p>
                                        </div>
                                        {pinnedBookmarks.map(renderBookmarkRow)}
                                    </>
                                ) : null}
                                {otherBookmarks.length > 0 ? (
                                    <>
                                        <div className="px-3 pb-1 pt-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {pinnedBookmarks.length > 0 ? "Other bookmarks" : "All bookmarks"}
                                            </p>
                                        </div>
                                        {otherBookmarks.map(renderBookmarkRow)}
                                    </>
                                ) : null}
                            </div>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                                <p>No bookmarks yet</p>
                                <p className="mt-2 max-w-[220px] text-sm text-muted-foreground">
                                    Saved profiles, circles and projects will appear here.
                                </p>
                                <Link
                                    href="/bookmarks"
                                    className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
                                    onClick={closeToolbox}
                                >
                                    View all bookmarks
                                </Link>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="connections" className="m-0 flex-grow overflow-auto pt-1">
                        {isLoadingConnections ? (
                            <div className="flex flex-1 items-center justify-center">
                                <LoadingSpinner />
                            </div>
                        ) : connections.accepted.length > 0 ||
                          connections.pendingIncoming.length > 0 ||
                          connections.pendingOutgoing.length > 0 ? (
                            <div className="pb-2">
                                {connections.pendingIncoming.length > 0 && (
                                    <div className="px-3 pb-1 pt-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Requests for you
                                        </p>
                                    </div>
                                )}
                                {connections.pendingIncoming.map((connection) =>
                                    renderConnectionRow(connection, "Requested You"),
                                )}
                                {connections.pendingOutgoing.length > 0 && (
                                    <div className="px-3 pb-1 pt-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Requested
                                        </p>
                                    </div>
                                )}
                                {connections.pendingOutgoing.map((connection) =>
                                    renderConnectionRow(connection, "Requested"),
                                )}
                                {connections.accepted.length > 0 && (
                                    <div className="px-3 pb-1 pt-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Connections
                                        </p>
                                    </div>
                                )}
                                {connections.accepted.map((connection) => renderConnectionRow(connection))}
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                                No connections yet
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="events" className="m-0 flex-grow overflow-auto pt-1 flex flex-col">
                        {isLoading ? (
                            <div className="flex flex-1 items-center justify-center">
                                <LoadingSpinner />
                            </div>
                        ) : user ? (
                            <EventTimeline
                                circleHandle={user.handle!}
                                events={events}
                                milestones={milestones}
                                condensed
                                onEventHidden={handleToolboxEventHidden}
                                onNavigate={handleEventNavigate}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                Loading events...
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

//user-toolbox.tsx - Displays the user toolbox that contains the user's chat rooms, notifications, circles, contacts, and account settings
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Circle as CircleIcon, CheckSquare, Hammer } from "lucide-react";
import { MdOutlineLogout } from "react-icons/md";
import { LuClipboardCheck, LuMail, LuSettings } from "react-icons/lu";
import {
    authInfoAtom,
    contentPreviewAtom,
    sidePanelContentVisibleAtom,
    userAtom,
    userToolboxDataAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter, usePathname } from "next/navigation";
import { Circle, MemberDisplay, UserToolboxTab, EventDisplay, TaskPermissions } from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { logOut } from "../auth/actions";
import { VerifyAccountButton } from "../modules/auth/verify-account-button";
import { Notifications } from "./notifications";
import Link from "next/link";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useIsMobile } from "../utils/use-is-mobile";
import { ChatList } from "../modules/chat/chat-list";
import TasksList from "../modules/tasks/tasks-list";
import EventTimeline from "../modules/events/event-timeline";
import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
import { getIssuesAction } from "@/app/circles/[handle]/issues/actions";
import { getCircleByIdAction } from "@/components/modules/circles/actions";
import { flushSync } from "react-dom";
import { LoadingSpinner } from "../ui/loading-spinner";

type Milestone = { id: string; type: "goal" | "task" | "issue"; title: string; date: Date | string };

export const UserToolbox = () => {
    const [user, setUser] = useAtom(userAtom);
    const [userToolboxState, setUserToolboxState] = useAtom(userToolboxDataAtom);
    const [tab, setTab] = useState<UserToolboxTab>("chat");
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
        closeToolbox();
        router.push(`/circles/${circle.handle}`);
    };

    const circles =
        user?.memberships
            ?.filter((m) => m.circle.circleType === "circle" && m.circle.handle !== "default")
            ?.map((membership) => membership.circle) || [];

    const projects =
        user?.memberships?.filter((m) => m.circle.circleType === "project")?.map((membership) => membership.circle) ||
        [];

    const [events, setEvents] = useState<EventDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
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

    const initialTasksData = {
        tasks: [],
        hasUserRanked: false,
        totalRankers: 0,
        unrankedCount: 0,
        userRankUpdatedAt: null as Date | null,
        userRankBecameStaleAt: null as Date | null,
    };

    const defaultTaskPermissions: TaskPermissions = {
        canModerate: false,
        canReview: false,
        canAssign: false,
        canResolve: false,
        canComment: true,
    };

    useEffect(() => {
        const fetchTimelineItems = async () => {
            if (!user?.handle) {
                setEvents([]);
                setMilestones([]);
                return;
            }

            try {
                const [eventsRes, goalsRes, tasksRes, issuesRes] = await Promise.all([
                    getEventsAction(user.handle, undefined, true, true),
                    getGoalsAction(user.handle, true, true),
                    getTasksAction(user.handle, true, true),
                    getIssuesAction(user.handle, true, true),
                ]);

                setEvents(eventsRes.events || []);

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
                                task?.targetDate && task?.stage !== "resolved" && task?.assignedTo === user?.did,
                        )
                        .map((task: any) => ({
                            id: (task as any)._id?.toString?.() || task._id,
                            type: "task" as const,
                            title: task.title,
                            date: task.targetDate,
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

    const handleTaskNavigate = useCallback(() => {
        closeToolbox();
        // Do not scroll to top as we use hash navigation for tasks
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

    const userHandle = user?.handle;

    const handleOpenSettings = useCallback(() => {
        if (!userHandle) return;

        closeToolbox();
        router.push(`/circles/${userHandle}/settings/about`);
    }, [closeToolbox, router, userHandle]);

    const handleTabChange = useCallback(
        (nextTab: string) => {
            if (nextTab === "settings") {
                handleOpenSettings();
                return;
            }
            setTab(nextTab as UserToolboxTab | undefined);
        },
        [handleOpenSettings, setTab],
    );

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
                            {user?.isMember ? (
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
                                <VerifyAccountButton />
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs
                    value={tab}
                    onValueChange={handleTabChange}
                    className="flex h-full flex-col"
                >
                    <TabsList className="grid h-auto w-full grid-cols-8 rounded-none border-b border-t-0 border-b-slate-200 border-t-slate-200 bg-white p-0 pb-2 pt-0">
                        {/* Existing TabsTriggers */}
                        <TabsTrigger
                            value="chat"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <LuMail className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="events"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <LuClipboardCheck className="h-5 w-5" />
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
                            value="projects"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <Hammer className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="tasks"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <CheckSquare className="h-5 w-5" />
                        </TabsTrigger>
                        <TabsTrigger
                            value="settings"
                            className={`m-0 ml-4 mr-4 h-8 w-8 rounded-full p-0 data-[state=active]:bg-primaryLight data-[state=active]:text-white data-[state=active]:shadow-md`}
                        >
                            <LuSettings className="h-5 w-5" />
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
                        <ChatList
                            chats={user?.chatRoomMemberships?.map((m) => m.chatRoom) || []}
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
                    <TabsContent value="projects" className="m-0 flex-grow overflow-auto pt-1">
                        {projects.length > 0 ? (
                            projects.map((project) => (
                                <div
                                    key={project._id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => openCircle(project)}
                                >
                                    <CirclePicture circle={project} size="40px" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{project.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {project.description ?? project.mission}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                                No projects yet
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="tasks" className="m-0 flex-grow overflow-auto pt-1">
                        {isLoading ? (
                            <div className="flex h-full items-center justify-center pt-4">
                                <LoadingSpinner />
                            </div>
                        ) : user ? (
                            <TasksList
                                tasksData={initialTasksData as any}
                                circle={user as any}
                                permissions={defaultTaskPermissions}
                                hideRank={true}
                                inToolbox={true}
                                onTaskNavigate={handleTaskNavigate}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                                Loading tasks...
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="events" className="m-0 flex-grow overflow-auto pt-1">
                        {isLoading ? (
                            <div className="flex h-full items-center justify-center pt-4">
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

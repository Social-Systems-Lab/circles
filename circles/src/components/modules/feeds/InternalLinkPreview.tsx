"use client";

import React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Circle,
    EventDisplay,
    FundingAskDisplay,
    GoalDisplay,
    PostDisplay,
    ProposalDisplay,
    IssueDisplay,
    TaskDisplay,
} from "@/models/models";
import { truncateText } from "@/lib/utils";
import {
    Users,
    AlertCircle,
    CircleHelp,
    CalendarDays,
    ListTodo,
} from "lucide-react";
import Image from "next/image";
import { FundingStatusPill, getFundingRequestSummaryLine } from "@/components/modules/funding/funding-shared";

// Define the type for the data prop more explicitly
type PreviewData =
    | Circle
    | PostDisplay
    | ProposalDisplay
    | IssueDisplay
    | TaskDisplay
    | GoalDisplay
    | EventDisplay
    | FundingAskDisplay;

type InternalLinkPreviewProps = {
    url: string; // Keep URL for the link itself
    initialData?: PreviewData | null; // Accept pre-fetched data
    previewType?: PostDisplay["internalPreviewType"];
};

const getPreviewImageUrl = (data: PreviewData | null | undefined): string | undefined => {
    if (!data || !("images" in data) || !Array.isArray(data.images) || data.images.length === 0) {
        return undefined;
    }

    return data.images[0]?.fileInfo?.url;
};

const addSourceParam = (href: string, source: string) => {
    try {
        const parsed = new URL(href, "http://dummybase");
        if (!parsed.searchParams.get("source")) {
            parsed.searchParams.set("source", source);
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}` || href;
    } catch {
        return href;
    }
};

const InternalLinkPreview: React.FC<InternalLinkPreviewProps> = ({ url, initialData, previewType }) => {
    const href = React.useMemo(() => {
        try {
            const parsed = new URL(url, "http://dummybase");
            return `${parsed.pathname}${parsed.search}${parsed.hash}` || url;
        } catch {
            return url;
        }
    }, [url]);

    // Removed useState and useEffect for fetching data

    // If no initial data, render a simple link (or potentially a loading state/fetch later if needed)
    if (!initialData) {
        return (
            <Link href={href} className="my-2 block text-blue-600 hover:underline">
                {href}
            </Link>
        );
    }

    // Determine the type based on the structure of initialData
    // This is a basic check; more robust type guards might be needed if structures overlap significantly
    const getDataType = (
        data: PreviewData,
    ): "circle" | "post" | "proposal" | "issue" | "task" | "goal" | "event" | "funding" | null => {
        if ("shortStory" in data && "trustBadgeType" in data) return "funding";
        if ("circleType" in data && data.circleType === "post") return "post";
        if ("stage" in data && "decisionText" in data) return "proposal";
        if ("startAt" in data && "endAt" in data) return "event";
        if ("resultPostId" in data || "resultSummary" in data || "completedAt" in data) return "goal";
        if ("stage" in data && "title" in data && !("decisionText" in data) && !("taskSpecificField" in data))
            return "issue";
        if ("stage" in data && "title" in data && !("decisionText" in data) /* && "taskSpecificField" in data */)
            return "task";
        if ("handle" in data && "members" in data) return "circle";
        return null;
    };

    const dataType = previewType ?? getDataType(initialData);
    const noticeboardHref = dataType === "task" || dataType === "event" ? addSourceParam(href, "noticeboard") : href;

    const getCircleTypeName = (circleType: string) => {
        switch (circleType) {
            default:
            case "circle":
                return "Community";
            case "project":
                return "Project";
            case "user":
                return "User";
        }
    };

    const renderPreviewContent = () => {
        if (!dataType) {
            // Fallback if type couldn't be determined
            return (
                <Link href={url} className="text-blue-600 hover:underline">
                    {url}
                </Link>
            );
        }

        switch (dataType) {
            case "circle":
                const circle = initialData as Circle;
                return (
                    <>
                        <Avatar className="h-10 w-10 rounded-md">
                            <AvatarImage src={circle.picture?.url} alt={circle.name} />
                            <AvatarFallback>
                                <Users className="h-5 w-5" />
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-xs text-gray-500">{getCircleTypeName(circle.circleType!)}</div>
                            <div className="font-medium">{circle.name}</div>
                            {(circle.description || circle.mission) && (
                                <p className="text-sm text-gray-600">
                                    {truncateText((circle.description ?? circle.mission)!, 100)}
                                </p>
                            )}
                        </div>
                    </>
                );
            case "post":
                const post = initialData as PostDisplay;
                return (
                    <>
                        <Avatar className="h-10 w-10 rounded-full">
                            <AvatarImage src={post.author?.picture?.url} alt={post.author?.name} />
                            <AvatarFallback>{post.author?.name?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-xs text-gray-500">Post by {post.author?.name}</div>
                            <p className="text-sm text-gray-800">{truncateText(post.content, 100)}</p>
                        </div>
                    </>
                );
            case "proposal":
                const proposal = initialData as ProposalDisplay;
                return (
                    <>
                        <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                            <CircleHelp className="h-5 w-5" />
                        </Avatar>
                        <div>
                            <div className="text-xs text-gray-500">Proposal</div>
                            <div className="font-medium">{proposal.name}</div>
                            <p className="text-sm text-gray-600">
                                Status:{" "}
                                <span className="font-semibold">
                                    {proposal.stage} {proposal.outcome ? `(${proposal.outcome})` : ""}
                                </span>
                            </p>
                        </div>
                    </>
                );
            case "issue":
                const issue = initialData as IssueDisplay;
                return (
                    <>
                        <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                            <AlertCircle className="h-5 w-5" />
                        </Avatar>
                        <div>
                            <div className="text-xs text-gray-500">Issue</div>
                            <div className="font-medium">{issue.title}</div>
                            <p className="text-sm text-gray-600">
                                Status: <span className="font-semibold">{issue.stage}</span>
                                {issue.assignee && ` | Assigned to: ${issue.assignee.name}`}
                            </p>
                        </div>
                    </>
                );
            case "task":
                const task = initialData as TaskDisplay;
                const taskPreviewImage = getPreviewImageUrl(task);
                return (
                    <div className="overflow-hidden rounded-[15px] border border-slate-200 bg-white">
                        {taskPreviewImage ? (
                            <div className="relative h-40 w-full bg-slate-100">
                                <Image
                                    src={taskPreviewImage}
                                    alt={task.title}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 480px"
                                />
                            </div>
                        ) : null}
                        <div className="space-y-3 p-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-green-100 text-green-700">
                                    <ListTodo className="h-5 w-5" />
                                </Avatar>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        {task.taskType === "shift" ? "Volunteer shift" : "Task"}
                                    </div>
                                    <div className="text-lg font-semibold text-slate-900">{task.title}</div>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600">
                                {task.taskType === "shift" ? "Join this shift" : "Status"}
                                {": "}
                                <span className="font-semibold">{task.stage}</span>
                                {task.taskType !== "shift" && task.assignee && ` | Assigned to: ${task.assignee.name}`}
                            </p>
                            <Button asChild size="sm" className="w-fit">
                                <Link
                                    href={noticeboardHref}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                    }}
                                >
                                    {task.taskType === "shift" ? "View shift" : "View task"}
                                </Link>
                            </Button>
                        </div>
                    </div>
                );
            case "goal":
                const goal = initialData as GoalDisplay;
                const goalPreviewImage = getPreviewImageUrl(goal);
                return (
                    <div className="overflow-hidden rounded-[15px] border border-slate-200 bg-white">
                        {goalPreviewImage ? (
                            <div className="relative h-40 w-full bg-slate-100">
                                <Image
                                    src={goalPreviewImage}
                                    alt={goal.title}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 480px"
                                />
                            </div>
                        ) : null}
                        <div className="space-y-3 p-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                                    <CircleHelp className="h-5 w-5" />
                                </Avatar>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Goal
                                    </div>
                                    <div className="text-lg font-semibold text-slate-900">{goal.title}</div>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600">
                                Status: <span className="font-semibold">{goal.stage}</span>
                            </p>
                            <p className="text-sm text-slate-600">{truncateText(goal.description, 140)}</p>
                        </div>
                    </div>
                );
            case "event":
                const event = initialData as EventDisplay;
                const eventPreviewImage = getPreviewImageUrl(event);
                return (
                    <div className="overflow-hidden rounded-[15px] border border-slate-200 bg-white">
                        {eventPreviewImage ? (
                            <div className="relative h-40 w-full bg-slate-100">
                                <Image
                                    src={eventPreviewImage}
                                    alt={event.title}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 480px"
                                />
                            </div>
                        ) : null}
                        <div className="space-y-3 p-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-100 text-sky-700">
                                    <CalendarDays className="h-5 w-5" />
                                </Avatar>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Event
                                    </div>
                                    <div className="text-lg font-semibold text-slate-900">{event.title}</div>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600">
                                Attend this event
                                {event.startAt
                                    ? ` | ${new Date(event.startAt).toLocaleString([], {
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                      })}`
                                    : ""}
                            </p>
                            <Button asChild size="sm" className="w-fit">
                                <Link
                                    href={noticeboardHref}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                    }}
                                >
                                    View event
                                </Link>
                            </Button>
                        </div>
                    </div>
                );
            case "funding":
                const ask = initialData as FundingAskDisplay;
                return (
                    <div className="overflow-hidden rounded-[15px] border border-slate-200 bg-white">
                        {ask.coverImage?.url ? (
                            <div className="relative h-40 w-full bg-slate-100">
                                <Image src={ask.coverImage.url} alt={ask.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 480px" />
                            </div>
                        ) : null}
                        <div className="space-y-3 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Funding request
                                </div>
                                <FundingStatusPill status={ask.status} />
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-slate-900">{ask.title}</div>
                                <p className="mt-1 text-sm text-slate-600">{ask.shortStory}</p>
                                <div className="mt-2 text-sm font-medium text-slate-700">
                                    {getFundingRequestSummaryLine(ask)}
                                </div>
                            </div>
                            <Button asChild size="sm" className="w-fit">
                                <Link
                                    href={href}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                    }}
                                >
                                    View request
                                </Link>
                            </Button>
                        </div>
                    </div>
                );
            default:
                return (
                    <Link href={href} className="text-blue-600 hover:underline">
                        {href}
                    </Link>
                );
        }
    };

    return (
        dataType === "funding" || dataType === "event" || dataType === "task" || dataType === "goal" ? (
            <div className="my-2">{renderPreviewContent()}</div>
        ) : (
            <Link href={href} className="my-2 block rounded-md border transition-colors hover:bg-gray-50">
                <div className="flex items-center space-x-3 p-3">{renderPreviewContent()}</div>
            </Link>
        )
    );
};

export default InternalLinkPreview;

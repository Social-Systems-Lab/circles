"use client";

import React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Circle, FundingAskDisplay, PostDisplay, ProposalDisplay, IssueDisplay, TaskDisplay } from "@/models/models";
import { truncateText } from "@/lib/utils";
import {
    Users,
    AlertCircle,
    CircleHelp,
    ListTodo,
} from "lucide-react";
import Image from "next/image";
import { FundingStatusPill, getFundingRequestSummaryLine } from "@/components/modules/funding/funding-shared";

// Define the type for the data prop more explicitly
type PreviewData = Circle | PostDisplay | ProposalDisplay | IssueDisplay | TaskDisplay | FundingAskDisplay;

type InternalLinkPreviewProps = {
    url: string; // Keep URL for the link itself
    initialData?: PreviewData | null; // Accept pre-fetched data
};

const InternalLinkPreview: React.FC<InternalLinkPreviewProps> = ({ url, initialData }) => {
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
    const getDataType = (data: PreviewData): "circle" | "post" | "proposal" | "issue" | "task" | "funding" | null => {
        if ("shortStory" in data && "trustBadgeType" in data) return "funding";
        if ("circleType" in data && data.circleType === "post") return "post";
        if ("stage" in data && "decisionText" in data) return "proposal";
        if ("stage" in data && "title" in data && !("decisionText" in data) && !("taskSpecificField" in data))
            return "issue";
        if ("stage" in data && "title" in data && !("decisionText" in data) /* && "taskSpecificField" in data */)
            return "task";
        if ("handle" in data && "members" in data) return "circle";
        return null;
    };

    const dataType = getDataType(initialData);

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
                return (
                    <>
                        <Avatar className="flex h-10 w-10 items-center justify-center rounded-md bg-green-100 text-green-700">
                            <ListTodo className="h-5 w-5" /> {/* Task icon */}
                        </Avatar>
                        <div>
                            <div className="text-xs text-gray-500">Task</div>
                            <div className="font-medium">{task.title}</div>
                            <p className="text-sm text-gray-600">
                                Status: <span className="font-semibold">{task.stage}</span>
                                {task.assignee && ` | Assigned to: ${task.assignee.name}`}
                            </p>
                        </div>
                    </>
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
        dataType === "funding" ? (
            <div className="my-2">{renderPreviewContent()}</div>
        ) : (
            <Link href={href} className="my-2 block rounded-md border transition-colors hover:bg-gray-50">
                <div className="flex items-center space-x-3 p-3">{renderPreviewContent()}</div>
            </Link>
        )
    );
};

export default InternalLinkPreview;

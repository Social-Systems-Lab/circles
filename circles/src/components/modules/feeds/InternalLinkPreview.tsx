"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getInternalLinkPreviewData, InternalLinkPreviewResult } from "./actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Circle, PostDisplay, ProposalDisplay, IssueDisplay, TaskDisplay } from "@/models/models"; // Added TaskDisplay
import { truncateText } from "@/lib/utils";
import {
    FileText,
    MessageSquare,
    Users,
    CheckSquare,
    AlertCircle,
    CircleDotDashed,
    CircleHelp,
    ListTodo,
} from "lucide-react"; // Added ListTodo for tasks

// Define the type for the data prop more explicitly
type PreviewData = Circle | PostDisplay | ProposalDisplay | IssueDisplay | TaskDisplay; // Added TaskDisplay

type InternalLinkPreviewProps = {
    url: string; // Keep URL for the link itself
    initialData?: PreviewData | null; // Accept pre-fetched data
};

const InternalLinkPreview: React.FC<InternalLinkPreviewProps> = ({ url, initialData }) => {
    // Removed useState and useEffect for fetching data

    // If no initial data, render a simple link (or potentially a loading state/fetch later if needed)
    if (!initialData) {
        return (
            <Link href={url} className="my-2 block text-blue-600 hover:underline">
                {url}
            </Link>
        );
    }

    // Determine the type based on the structure of initialData
    // This is a basic check; more robust type guards might be needed if structures overlap significantly
    const getDataType = (data: PreviewData): "circle" | "post" | "proposal" | "issue" | "task" | null => {
        // Added "task"
        if ("circleType" in data && data.circleType === "post") return "post";
        if ("stage" in data && "decisionText" in data) return "proposal";
        // Check for task before issue, assuming tasks might have similar fields but maybe a unique one later?
        // For now, rely on the order or add a specific task field check if needed.
        // Let's assume for now that if it has 'stage' and 'title' but not 'decisionText', it could be issue OR task.
        // We'll differentiate based on how the data is passed or add a specific field later.
        // For now, let's add a placeholder check or rely on the order in the switch.
        // A better approach would be to add a distinguishing property in the model if needed.
        // Let's refine the issue check slightly and add task check
        if ("stage" in data && "title" in data && !("decisionText" in data) && !("taskSpecificField" in data))
            return "issue"; // Placeholder
        if ("stage" in data && "title" in data && !("decisionText" in data) /* && "taskSpecificField" in data */)
            return "task"; // Placeholder for task check
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
            default:
                return (
                    <Link href={url} className="text-blue-600 hover:underline">
                        {url}
                    </Link>
                );
        }
    };

    return (
        <Link href={url} className="my-2 block rounded-md border transition-colors hover:bg-gray-50">
            <div className="flex items-center space-x-3 p-3">{renderPreviewContent()}</div>
        </Link>
    );
};

export default InternalLinkPreview;

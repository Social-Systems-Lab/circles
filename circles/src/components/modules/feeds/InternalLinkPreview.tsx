"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getInternalLinkPreviewData, InternalLinkPreviewResult } from "./actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Circle, PostDisplay, ProposalDisplay, IssueDisplay } from "@/models/models";
import { truncateText } from "@/lib/utils"; // Assuming a utility for text truncation exists
import { FileText, MessageSquare, Users, CheckSquare, AlertCircle, CircleDotDashed, CircleHelp } from "lucide-react"; // Example icons

type InternalLinkPreviewProps = {
    url: string;
};

const InternalLinkPreview: React.FC<InternalLinkPreviewProps> = ({ url }) => {
    const [result, setResult] = useState<InternalLinkPreviewResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);

        getInternalLinkPreviewData(url)
            .then((data) => {
                if (isMounted) {
                    setResult(data);
                    setIsLoading(false);
                }
            })
            .catch((error) => {
                console.error("Error fetching internal link preview:", error);
                if (isMounted) {
                    setResult({ error: "Failed to load preview" });
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [url]);

    if (isLoading) {
        return (
            <div className="my-2 flex items-center space-x-3 rounded-md border p-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>
        );
    }

    if (!result || "error" in result) {
        // Render as a simple link if error or no data
        return (
            <Link href={url} className="text-blue-600 hover:underline">
                {url}
            </Link>
        );
    }

    const getCircleTypeName = (circleType: string) => {
        switch (circleType) {
            default:
            case "circle":
                return "Circle";
            case "project":
                return "Project";
            case "user":
                return "User";
        }
    };

    const renderPreviewContent = () => {
        switch (result.type) {
            case "circle":
                const circle = result.data as Circle;
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
                            {circle.description && (
                                <p className="text-sm text-gray-600">{truncateText(circle.description, 100)}</p>
                            )}
                        </div>
                    </>
                );
            case "post":
                const post = result.data as PostDisplay;
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
                const proposal = result.data as ProposalDisplay;
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
                const issue = result.data as IssueDisplay;
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

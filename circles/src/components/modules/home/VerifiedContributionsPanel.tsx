"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, ContentPreviewData, TaskDisplay, TaskPermissions } from "@/models/models";

export type VerifiedContributionItem = {
    task: TaskDisplay;
    circle: Circle;
    permissions: TaskPermissions;
};

type VerifiedContributionsPanelProps = {
    items: VerifiedContributionItem[];
    totalPublicCount: number;
};

const PREVIEW_LIMIT = 5;

export default function VerifiedContributionsPanel({
    items,
    totalPublicCount,
}: VerifiedContributionsPanelProps) {
    const router = useRouter();
    const isCompact = useIsCompact();
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
    const [showAllVisible, setShowAllVisible] = useState(false);

    const hasAnyContributions = totalPublicCount > 0 || items.length > 0;
    const visibleItems = showAllVisible ? items : items.slice(0, PREVIEW_LIMIT);
    const hasMoreVisibleItems = items.length > PREVIEW_LIMIT;
    const publicContributionLabel = `${totalPublicCount} public contribution${totalPublicCount === 1 ? "" : "s"}`;

    const openTask = useCallback(
        (item: VerifiedContributionItem) => {
            if (!item.circle.handle) {
                return;
            }

            if (isCompact) {
                router.push(`/circles/${item.circle.handle}/tasks/${item.task._id}`);
                return;
            }

            const preview: ContentPreviewData = {
                type: "task",
                content: item.task,
                props: {
                    circle: item.circle,
                    permissions: item.permissions,
                },
            };

            setContentPreview((current) => {
                const isCurrentTask =
                    current?.type === "task" &&
                    current.content._id === item.task._id &&
                    sidePanelContentVisible === "content";

                return isCurrentTask ? undefined : preview;
            });
        },
        [isCompact, router, setContentPreview, sidePanelContentVisible],
    );

    return (
        <div className="w-full">
            <div>
                <h2 className="text-base font-semibold text-foreground">Verified Contributions</h2>
                <p className="mt-1 text-xs text-muted-foreground">Verified work completed on Kamooni</p>
            </div>
            {!hasAnyContributions ? (
                <div className="mt-2 space-y-1">
                    <p className="text-sm text-muted-foreground">No verified contributions yet</p>
                    <p className="text-xs text-muted-foreground">
                        Complete tasks to build your contribution history
                    </p>
                </div>
            ) : (
                <>
                    <p className="mt-2 text-sm text-muted-foreground">{publicContributionLabel}</p>
                    {items.length > 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPreviewExpanded((current) => {
                                        if (current) {
                                            setShowAllVisible(false);
                                        }
                                        return !current;
                                    });
                                }}
                                className="mt-4 flex w-full items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
                                aria-expanded={isPreviewExpanded}
                            >
                                <span>{isPreviewExpanded ? "Hide contributions" : "View contributions"}</span>
                                {isPreviewExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                            </button>
                            {isPreviewExpanded && (
                                <>
                                    <div className="mt-4 space-y-2">
                                        {visibleItems.map((item) => (
                                            <button
                                                key={String(item.task._id)}
                                                type="button"
                                                onClick={() => openTask(item)}
                                                className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                                            >
                                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium leading-tight text-foreground">
                                                        {item.task.title}
                                                    </div>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                        <span className="truncate">{item.circle.name}</span>
                                                        {item.task.verifiedAt && (
                                                            <>
                                                                <span aria-hidden="true">•</span>
                                                                <span>
                                                                    Verified{" "}
                                                                    {formatDistanceToNow(item.task.verifiedAt, {
                                                                        addSuffix: true,
                                                                    })}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-4">
                                        {hasMoreVisibleItems ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllVisible((current) => !current)}
                                                className="text-sm font-medium text-foreground underline underline-offset-4"
                                            >
                                                {showAllVisible ? "Show less" : "Show all"}
                                            </button>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Showing all visible contributions</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">No visible contributions for this viewer.</p>
                    )}
                </>
            )}
        </div>
    );
}

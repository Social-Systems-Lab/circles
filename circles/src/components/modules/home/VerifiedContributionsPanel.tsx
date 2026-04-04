"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2 } from "lucide-react";
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
};

export default function VerifiedContributionsPanel({ items }: VerifiedContributionsPanelProps) {
    const router = useRouter();
    const isCompact = useIsCompact();
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);

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
        <div className="mb-6 w-full">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Verified Contributions</div>
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No verified contributions yet</p>
            ) : (
                <>
                    <p className="mb-3 text-sm text-muted-foreground">{items.length} verified contributions</p>
                    <div className="space-y-2">
                        {items.map((item) => (
                            <button
                                key={String(item.task._id)}
                                type="button"
                                onClick={() => openTask(item)}
                                className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40"
                            >
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-foreground">{item.task.title}</div>
                                    <div className="truncate text-sm text-muted-foreground">{item.circle.name}</div>
                                    {item.task.verifiedAt && (
                                        <div className="text-xs text-muted-foreground">
                                            Verified {formatDistanceToNow(item.task.verifiedAt, { addSuffix: true })}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

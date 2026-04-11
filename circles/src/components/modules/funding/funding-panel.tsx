"use client";

import React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FundingAskDisplay } from "@/models/models";
import {
    formatFundingAmount,
    formatFundingOpenItemTotals,
    getFundingOpenItemCount,
} from "./funding-shared";
import { FundingDemoButton } from "./funding-demo-button";

type FundingPanelVisibility = "visible" | "sign_in" | "members_only";

type FundingPanelProps = {
    circleHandle: string;
    asks: FundingAskDisplay[];
    canCreate: boolean;
    visibility: FundingPanelVisibility;
};

export function FundingPanel({ circleHandle, asks, canCreate, visibility }: FundingPanelProps) {
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const hasVisibleAsks = visibility === "visible" && asks.length > 0;
    const activeItemCount = asks.reduce((total, ask) => total + getFundingOpenItemCount(ask), 0);

    return (
        <div className="rounded-[15px] border-0 bg-white p-4 shadow-lg sm:p-5 md:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Funding Needs</div>
                    {visibility === "visible" ? (
                        <div className="mt-1 text-sm text-slate-600">
                            {activeItemCount} active item{activeItemCount === 1 ? "" : "s"} across {asks.length} request
                            {asks.length === 1 ? "" : "s"}
                        </div>
                    ) : null}
                </div>
                {visibility === "visible" ? (
                    <Button asChild variant="ghost" size="sm">
                        <Link href={`/circles/${circleHandle}/funding`}>View all</Link>
                    </Button>
                ) : null}
            </div>

            {visibility === "sign_in" ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">Funding Needs are members-only. Sign in to view them.</p>
                    <Button asChild size="sm">
                        <Link href="/login">Sign in</Link>
                    </Button>
                </div>
            ) : visibility === "members_only" ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Funding Needs are only visible to circle members.
                </div>
            ) : hasVisibleAsks ? (
                <div className="space-y-2">
                    {asks.map((ask) => {
                        const askId = ask._id?.toString() || "";
                        const isExpanded = expandedId === askId;
                        const openItemCount = getFundingOpenItemCount(ask);

                        return (
                            <div key={askId} className="rounded-xl border border-slate-200">
                                <button
                                    type="button"
                                    className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left sm:px-4"
                                    onClick={() => setExpandedId((current) => (current === askId ? null : askId))}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-slate-900 sm:text-[15px]">{ask.title}</div>
                                        <div className="mt-0.5 line-clamp-1 text-sm text-slate-600">
                                            {ask.shortStory || formatFundingOpenItemTotals(ask)}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500 sm:text-sm">
                                        <div className="whitespace-nowrap">
                                            {openItemCount} open item{openItemCount === 1 ? "" : "s"}
                                        </div>
                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </div>
                                </button>

                                {isExpanded ? (
                                    <div className="border-t border-slate-200 px-3 py-2.5 sm:px-4">
                                        <div className="space-y-2">
                                            {(ask.items || []).map((item, index) => (
                                                <div
                                                    key={`${item.title}-${index}`}
                                                    className="rounded-lg bg-slate-50 px-3 py-2.5"
                                                >
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-slate-900">{item.title}</div>
                                                            {item.note ? (
                                                                <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{item.note}</div>
                                                            ) : null}
                                                        </div>

                                                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                                                            <div className="text-sm font-medium text-slate-900">
                                                                {formatFundingAmount(item.price, item.currency)}
                                                            </div>
                                                            {item.status === "open" ? <FundingDemoButton /> : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-2 flex justify-end">
                                            <Button asChild variant="ghost" size="sm" className="px-2">
                                                <Link href={`/circles/${circleHandle}/funding/${askId}`}>View request</Link>
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : canCreate ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">No funding requests yet.</p>
                    <Button asChild size="sm">
                        <Link href={`/circles/${circleHandle}/funding/new`}>Create funding request</Link>
                    </Button>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No funding requests yet.
                </div>
            )}
        </div>
    );
}

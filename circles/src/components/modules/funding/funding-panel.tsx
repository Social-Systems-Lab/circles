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
        <div className="rounded-[15px] border-0 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-4">
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

                        return (
                            <div key={askId} className="rounded-xl border border-slate-200">
                                <button
                                    type="button"
                                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                                    onClick={() => setExpandedId((current) => (current === askId ? null : askId))}
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium text-slate-900">{ask.title}</div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            {ask.shortStory || formatFundingOpenItemTotals(ask)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-sm text-slate-500">
                                        <div>
                                            {getFundingOpenItemCount(ask)} open item{getFundingOpenItemCount(ask) === 1 ? "" : "s"}
                                        </div>
                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </div>
                                </button>

                                {isExpanded ? (
                                    <div className="border-t border-slate-200 px-4 py-3">
                                        <div className="space-y-3">
                                            {(ask.items || []).map((item, index) => (
                                                <div
                                                    key={`${item.title}-${index}`}
                                                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3"
                                                >
                                                    <div>
                                                        <div className="font-medium text-slate-900">{item.title}</div>
                                                        {item.note ? (
                                                            <div className="mt-1 text-sm text-slate-600">{item.note}</div>
                                                        ) : null}
                                                    </div>

                                                    <div className="flex items-start gap-4">
                                                        <div className="text-sm font-medium text-slate-900">
                                                            {formatFundingAmount(item.price, item.currency)}
                                                        </div>
                                                        {item.status === "open" ? <FundingDemoButton /> : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-3 flex justify-end">
                                            <Button asChild variant="ghost" size="sm">
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
                    <p className="text-sm text-slate-600">
                        No funding requests have been published yet.
                    </p>
                    <Button asChild size="sm">
                        <Link href={`/circles/${circleHandle}/funding/new`}>Create funding request</Link>
                    </Button>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No funding requests have been published yet.
                </div>
            )}
        </div>
    );
}

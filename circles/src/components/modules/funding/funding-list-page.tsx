"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Circle, FundingAskDisplay, FundingAskStatus } from "@/models/models";
import { FundingCard } from "./funding-card";
import { fundingCategoryOptions, getFundingOpenItemCount } from "./funding-shared";

const statusOptions: { value: FundingAskStatus | "all"; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "draft", label: "Draft" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "closed", label: "Closed" },
];

type FundingListPageProps = {
    circle: Circle;
    asks: FundingAskDisplay[];
    canCreate: boolean;
};

export function FundingListPage({ circle, asks, canCreate }: FundingListPageProps) {
    const [statusFilter, setStatusFilter] = React.useState<FundingAskStatus | "all">("all");
    const [categoryFilter, setCategoryFilter] = React.useState<string>("all");

    const filteredAsks = React.useMemo(() => {
        return asks.filter((ask) => {
            if (statusFilter !== "all" && ask.status !== statusFilter) {
                return false;
            }
            if (categoryFilter !== "all" && !(ask.items || []).some((item) => item.category === categoryFilter)) {
                return false;
            }
            return true;
        });
    }, [asks, categoryFilter, statusFilter]);

    const filteredDrafts = filteredAsks.filter((ask) => ask.status === "draft");
    const filteredPublishedAsks = filteredAsks.filter((ask) => ask.status !== "draft");
    const activeItemCount = filteredPublishedAsks.reduce((total, ask) => total + getFundingOpenItemCount(ask), 0);

    return (
        <div className="formatted mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
            <div className="flex flex-col gap-4 rounded-[15px] bg-white p-6 shadow-lg md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="m-0 text-3xl font-bold text-slate-900">Funding Needs</h1>
                    <p className="mt-2 max-w-3xl text-sm text-slate-600">
                        Funding requests group together several individually fundable child items. Fund buttons are demo-only in this MVP.
                    </p>
                    {filteredDrafts.length > 0 ? (
                        <p className="mt-2 text-sm text-slate-600">
                            Drafts below are only visible to Super Admins.
                        </p>
                    ) : null}
                    {filteredPublishedAsks.length > 0 ? (
                        <p className="mt-2 text-sm text-slate-600">
                            {filteredPublishedAsks.length} request{filteredPublishedAsks.length === 1 ? "" : "s"} • {activeItemCount} active item{activeItemCount === 1 ? "" : "s"}
                        </p>
                    ) : null}
                </div>
                {canCreate && (
                    <Button asChild>
                        <Link href={`/circles/${circle.handle}/funding/new`}>Create funding request</Link>
                    </Button>
                )}
            </div>

            <Card className="rounded-[15px] border-slate-200 shadow-sm">
                <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FundingAskStatus | "all")}>
                        <SelectTrigger>
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            {statusOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger>
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {fundingCategoryOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {filteredDrafts.length > 0 ? (
                <section className="space-y-3">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Drafts</h2>
                        <p className="text-sm text-slate-600">Not public. Visible only to Super Admins.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {filteredDrafts.map((ask) => (
                            <FundingCard key={ask._id?.toString()} ask={ask} circleHandle={circle.handle!} />
                        ))}
                    </div>
                </section>
            ) : null}

            {filteredPublishedAsks.length > 0 ? (
                <section className="space-y-3">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Published requests</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {filteredPublishedAsks.map((ask) => (
                            <FundingCard key={ask._id?.toString()} ask={ask} circleHandle={circle.handle!} />
                        ))}
                    </div>
                </section>
            ) : (
                <div className="rounded-[15px] border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                    {filteredDrafts.length > 0
                        ? "Only draft funding requests match the current filters."
                        : "No funding requests match the current filters."}
                </div>
            )}
        </div>
    );
}

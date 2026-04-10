"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Circle, FundingAskDisplay, FundingAskStatus } from "@/models/models";
import { FundingCard } from "./funding-card";
import { fundingCategoryOptions } from "./funding-shared";

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
    const [minAmount, setMinAmount] = React.useState("");
    const [maxAmount, setMaxAmount] = React.useState("");
    const [openOnly, setOpenOnly] = React.useState(false);

    const filteredAsks = React.useMemo(() => {
        const minValue = minAmount ? Number(minAmount) : undefined;
        const maxValue = maxAmount ? Number(maxAmount) : undefined;

        return asks.filter((ask) => {
            if (openOnly && ask.status !== "open") {
                return false;
            }
            if (statusFilter !== "all" && ask.status !== statusFilter) {
                return false;
            }
            if (categoryFilter !== "all" && ask.category !== categoryFilter) {
                return false;
            }
            if (typeof minValue === "number" && Number.isFinite(minValue) && ask.amount < minValue) {
                return false;
            }
            if (typeof maxValue === "number" && Number.isFinite(maxValue) && ask.amount > maxValue) {
                return false;
            }
            return true;
        });
    }, [asks, categoryFilter, maxAmount, minAmount, openOnly, statusFilter]);

    return (
        <div className="formatted mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
            <div className="flex flex-col gap-4 rounded-[15px] bg-white p-6 shadow-lg md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="m-0 text-3xl font-bold text-slate-900">Funding Needs</h1>
                    <p className="mt-2 max-w-3xl text-sm text-slate-600">
                        Each ask is one concrete need with one total price. This MVP supports manual claiming and manual
                        completion only. There is no pooled crowdfunding or payment processing here.
                    </p>
                </div>
                {canCreate && (
                    <Button asChild>
                        <Link href={`/circles/${circle.handle}/funding/new`}>Create funding ask</Link>
                    </Button>
                )}
            </div>

            <Card className="rounded-[15px] border-slate-200 shadow-sm">
                <CardContent className="grid gap-4 p-4 md:grid-cols-5">
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

                    <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="Min amount"
                        value={minAmount}
                        onChange={(event) => setMinAmount(event.target.value)}
                    />

                    <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="Max amount"
                        value={maxAmount}
                        onChange={(event) => setMaxAmount(event.target.value)}
                    />

                    <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <Checkbox checked={openOnly} onCheckedChange={(checked) => setOpenOnly(Boolean(checked))} />
                        Open only
                    </label>
                </CardContent>
            </Card>

            {filteredAsks.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredAsks.map((ask) => (
                        <FundingCard key={ask._id?.toString()} ask={ask} circleHandle={circle.handle!} />
                    ))}
                </div>
            ) : (
                <div className="rounded-[15px] border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                    No funding asks match the current filters.
                </div>
            )}
        </div>
    );
}

"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ListChecks, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { closeFundingAskAction, completeFundingAskAction } from "@/app/circles/[handle]/funding/actions";
import type { Circle, FundingAskDisplay } from "@/models/models";
import {
    FundingProxyBadge,
    FundingStatusPill,
    FundingTrustBadge,
    fundingBeneficiaryTypeLabels,
    fundingCategoryLabels,
    fundingItemStatusLabels,
    formatFundingAmount,
    formatFundingOpenItemTotals,
    getFundingOpenItemCount,
} from "./funding-shared";
import { FundingDemoButton } from "./funding-demo-button";

type FundingDetailProps = {
    circle: Circle;
    ask: FundingAskDisplay;
    canManageAsk: boolean;
};

export function FundingDetail({ circle, ask, canManageAsk }: FundingDetailProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = React.useTransition();
    const [completionDialogOpen, setCompletionDialogOpen] = React.useState(false);
    const [completionNote, setCompletionNote] = React.useState(ask.completionNote || "");

    const runAction = (action: () => Promise<{ success: boolean; message: string }>) => {
        startTransition(async () => {
            const result = await action();
            if (!result.success) {
                toast({
                    title: "Action failed",
                    description: result.message,
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: "Funding request updated",
                description: result.message,
            });
            router.refresh();
        });
    };

    const showManageActions = canManageAsk && ask.status !== "completed" && ask.status !== "closed";
    const openItemCount = getFundingOpenItemCount(ask);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-10">
            <Card className="overflow-hidden rounded-[18px] border-slate-200 shadow-sm">
                {ask.coverImage?.url ? (
                    <div className="relative aspect-[16/7] w-full bg-slate-100">
                        <Image src={ask.coverImage.url} alt={ask.title} fill className="object-cover" sizes="1200px" />
                    </div>
                ) : null}
                <CardContent className="space-y-5 p-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <FundingStatusPill status={ask.status} />
                        <FundingTrustBadge trustBadgeType={ask.trustBadgeType} />
                        {ask.isProxy ? <FundingProxyBadge /> : null}
                    </div>

                    <div className="space-y-3">
                        <h1 className="m-0 text-3xl font-bold text-slate-900">{ask.title}</h1>
                        <div className="text-sm font-medium text-slate-700">
                            {openItemCount} open item{openItemCount === 1 ? "" : "s"} • {formatFundingOpenItemTotals(ask)}
                        </div>
                        <p className="max-w-3xl text-base text-slate-700">{ask.shortStory}</p>
                    </div>

                    {showManageActions ? (
                        <div className="flex flex-wrap gap-3">
                            <Button asChild variant="outline">
                                <Link href={`/circles/${circle.handle}/funding/${ask._id}/edit`}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Link>
                            </Button>

                            {ask.status === "open" ? (
                                <Button type="button" variant="outline" onClick={() => setCompletionDialogOpen(true)} disabled={isPending}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Mark completed
                                </Button>
                            ) : null}

                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => runAction(() => closeFundingAskAction(circle.handle!, ask._id.toString()))}
                                disabled={isPending}
                            >
                                Close
                            </Button>
                        </div>
                    ) : null}

                    {ask.status === "completed" && ask.completionNote ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                            <div className="font-medium">Completion note</div>
                            <p className="mt-2 whitespace-pre-wrap">{ask.completionNote}</p>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(280px,1fr)]">
                <Card className="rounded-[18px] border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>Request details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <section>
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Project context</div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                                {ask.description || "No extra project context provided."}
                            </p>
                        </section>

                        <section>
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Funding items</div>
                            <div className="mt-3 space-y-3">
                                {(ask.items || []).map((item, index) => (
                                    <div
                                        key={`${item.title}-${index}`}
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="font-medium text-slate-900">{item.title}</div>
                                                <div className="text-xs uppercase tracking-wide text-slate-500">
                                                    {fundingCategoryLabels[item.category]}
                                                </div>
                                                <div className="text-sm text-slate-600">
                                                    {fundingItemStatusLabels[item.status]}
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-4">
                                                <div className="text-sm font-medium text-slate-900">
                                                    {formatFundingAmount(item.price, item.currency)}
                                                </div>
                                                {item.status === "open" ? <FundingDemoButton /> : null}
                                            </div>
                                        </div>

                                        {item.quantity || item.unitLabel ? (
                                            <div className="mt-2 text-sm text-slate-600">
                                                {[item.quantity ? String(item.quantity) : undefined, item.unitLabel].filter(Boolean).join(" ")}
                                            </div>
                                        ) : null}

                                        {item.note ? <p className="mt-2 text-sm leading-6 text-slate-700">{item.note}</p> : null}
                                    </div>
                                ))}
                            </div>
                        </section>

                        {ask.isProxy && ask.proxyNote ? (
                            <section>
                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Proxy note</div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ask.proxyNote}</p>
                            </section>
                        ) : null}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="rounded-[18px] border-slate-200 shadow-sm">
                        <CardHeader>
                            <CardTitle>Request summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-slate-700">
                            <div className="flex items-start gap-3">
                                <ListChecks className="mt-0.5 h-4 w-4 text-slate-500" />
                                <div>
                                    <div className="font-medium">Open items</div>
                                    <div>
                                        {openItemCount} open item{openItemCount === 1 ? "" : "s"}
                                    </div>
                                    <div>{formatFundingOpenItemTotals(ask)}</div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <UserRound className="mt-0.5 h-4 w-4 text-slate-500" />
                                <div>
                                    <div className="font-medium">Beneficiary</div>
                                    <div>
                                        {ask.isProxy
                                            ? ask.beneficiaryName || "Proxy beneficiary"
                                            : ask.beneficiaryName || circle.name || "This circle"}
                                    </div>
                                    <div className="text-xs text-slate-500">{fundingBeneficiaryTypeLabels[ask.beneficiaryType]}</div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-500" />
                                <div>
                                    <div className="font-medium">Created by</div>
                                    <div>
                                        {ask.creator?.handle
                                            ? `@${ask.creator.handle}`
                                            : ask.createdByHandleSnapshot
                                              ? `@${ask.createdByHandleSnapshot}`
                                              : "Super Admin"}
                                    </div>
                                </div>
                            </div>

                            {ask.updatedAt ? (
                                <div className="text-xs text-slate-500">
                                    Updated {formatDistanceToNow(new Date(ask.updatedAt), { addSuffix: true })}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark funding request completed</DialogTitle>
                        <DialogDescription>
                            Add a short outcome note so members can see how this funding request was completed.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        value={completionNote}
                        onChange={(event) => setCompletionNote(event.target.value)}
                        rows={6}
                        placeholder="Add a short update about the outcome."
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCompletionDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                runAction(() => completeFundingAskAction(circle.handle!, ask._id.toString(), completionNote));
                                setCompletionDialogOpen(false);
                            }}
                            disabled={isPending}
                        >
                            Save completion
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

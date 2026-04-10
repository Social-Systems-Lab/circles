"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, CircleDollarSign, Pencil, ShieldCheck, UserRound } from "lucide-react";
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
import { claimFundingAskAction, closeFundingAskAction, completeFundingAskAction } from "@/app/circles/[handle]/funding/actions";
import type { Circle, FundingAskDisplay } from "@/models/models";
import {
    FundingProxyBadge,
    FundingStatusPill,
    FundingTrustBadge,
    formatFundingAmount,
} from "./funding-shared";

type FundingDetailProps = {
    circle: Circle;
    ask: FundingAskDisplay;
    canManageAsk: boolean;
    canClaimAsk: boolean;
    isActiveSupporter: boolean;
};

export function FundingDetail({ circle, ask, canManageAsk, canClaimAsk, isActiveSupporter }: FundingDetailProps) {
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
                title: "Funding ask updated",
                description: result.message,
            });
            router.refresh();
        });
    };

    const showManageActions = canManageAsk && ask.status !== "completed" && ask.status !== "closed";

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
                        {ask.isProxy && <FundingProxyBadge />}
                    </div>

                    <div className="space-y-3">
                        <h1 className="m-0 text-3xl font-bold text-slate-900">{ask.title}</h1>
                        <div className="text-2xl font-semibold text-slate-900">
                            {formatFundingAmount(ask.amount, ask.currency)}
                        </div>
                        <p className="max-w-3xl text-base text-slate-700">{ask.shortStory}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {ask.status === "open" && canClaimAsk && (
                            <Button onClick={() => runAction(() => claimFundingAskAction(circle.handle!, ask._id.toString()))} disabled={isPending}>
                                I will fund this
                            </Button>
                        )}

                        {showManageActions && (
                            <>
                                <Button asChild variant="outline">
                                    <Link href={`/circles/${circle.handle}/funding/${ask._id}/edit`}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                    </Link>
                                </Button>

                                {ask.status === "in_progress" && (
                                    <Button type="button" variant="outline" onClick={() => setCompletionDialogOpen(true)} disabled={isPending}>
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Mark completed
                                    </Button>
                                )}

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => runAction(() => closeFundingAskAction(circle.handle!, ask._id.toString()))}
                                    disabled={isPending}
                                >
                                    Close
                                </Button>
                            </>
                        )}
                    </div>

                    {ask.status === "in_progress" && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            {isActiveSupporter ? (
                                <p>You are supporting this ask.</p>
                            ) : ask.activeSupporter?.handle ? (
                                <p>Currently being supported by @{ask.activeSupporter.handle}.</p>
                            ) : ask.activeSupporterHandleSnapshot ? (
                                <p>Currently being supported by @{ask.activeSupporterHandleSnapshot}.</p>
                            ) : (
                                <p>This ask is currently in progress.</p>
                            )}
                        </div>
                    )}

                    {ask.status === "completed" && ask.completionNote && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                            <div className="font-medium">Completion note</div>
                            <p className="mt-2 whitespace-pre-wrap">{ask.completionNote}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(280px,1fr)]">
                <Card className="rounded-[18px] border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <section>
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                                {ask.description || "No extra description provided."}
                            </p>
                        </section>

                        <section>
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Completion plan</div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ask.completionPlan}</p>
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
                            <CardTitle>Ask summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-slate-700">
                            <div className="flex items-start gap-3">
                                <CircleDollarSign className="mt-0.5 h-4 w-4 text-slate-500" />
                                <div>
                                    <div className="font-medium">Amount</div>
                                    <div>{formatFundingAmount(ask.amount, ask.currency)}</div>
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
                                              : "Circle member"}
                                    </div>
                                </div>
                            </div>

                            {ask.updatedAt && (
                                <div className="text-xs text-slate-500">
                                    Updated {formatDistanceToNow(new Date(ask.updatedAt), { addSuffix: true })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark funding ask completed</DialogTitle>
                        <DialogDescription>
                            Add a short outcome note so members can see how this ask was fulfilled.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        rows={6}
                        value={completionNote}
                        onChange={(event) => setCompletionNote(event.target.value)}
                        placeholder="Explain what was delivered and how it was confirmed."
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCompletionDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                setCompletionDialogOpen(false);
                                runAction(() => completeFundingAskAction(circle.handle!, ask._id.toString(), completionNote));
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

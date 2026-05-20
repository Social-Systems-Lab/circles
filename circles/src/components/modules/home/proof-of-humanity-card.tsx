"use client";

import Link from "next/link";
import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Circle, HumanityVerificationDisplay, HumanityVerificationLevel } from "@/models/models";
import type { HumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
    removeProofOfHumanityVerificationAction,
    saveProofOfHumanityVerificationAction,
} from "./proof-of-humanity-actions";

type ProofOfHumanityCardProps = {
    circle: Circle;
    summary: HumanityVerificationSummary;
};

const humanBadgeClassName =
    "rounded-full border border-[#1f6b45] bg-[#e8f4ec] px-3 py-1 text-[#174f34] hover:border-[#1a5a3a] hover:bg-[#deeee4] hover:text-[#123d28]";
const verifiedHumanBadgeClassName =
    "rounded-full border-transparent bg-[hsl(var(--button-primary))] px-3 py-1 text-[hsl(var(--button-primary-foreground))] hover:bg-[hsl(var(--button-primary-hover))] hover:text-[hsl(var(--button-primary-foreground))]";

const formatCountLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

export function ProofOfHumanityHeaderAction({
    circle,
    summary,
}: {
    circle: Circle;
    summary: HumanityVerificationSummary;
}) {
    if (circle.circleType !== "user") {
        return null;
    }

    if (summary.totalActiveCount > 0) {
        return (
            <Button asChild variant="outline" size="sm" className={verifiedHumanBadgeClassName}>
                <Link href={`/circles/${circle.handle}/home#proof-of-humanity`}>✓ Human</Link>
            </Button>
        );
    }

    if (!summary.canCurrentViewerVerify) {
        return null;
    }

    return (
        <Button asChild variant="outline" size="sm" className={humanBadgeClassName}>
            <Link href={`/circles/${circle.handle}/home#proof-of-humanity`}>Verify Human</Link>
        </Button>
    );
}

export function ProofOfHumanityCard({ circle, summary }: ProofOfHumanityCardProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [level, setLevel] = useState<HumanityVerificationLevel>(summary.viewerVerification?.level ?? "real_person");
    const [note, setNote] = useState(summary.viewerVerification?.note ?? "");
    const [acknowledgedPublic, setAcknowledgedPublic] = useState(false);

    const viewerVerification = summary.viewerVerification;
    const summaryLine = `${formatCountLabel(summary.realPersonCount, "real person", "real people")} · ${formatCountLabel(
        summary.metInRealLifeCount,
        "met in real life",
        "met in real life",
    )}`;

    useEffect(() => {
        const syncExpandedWithHash = () => {
            if (window.location.hash === "#proof-of-humanity") {
                setIsExpanded(true);
            }
        };

        syncExpandedWithHash();
        window.addEventListener("hashchange", syncExpandedWithHash);
        return () => window.removeEventListener("hashchange", syncExpandedWithHash);
    }, []);

    const handleSave = () => {
        startTransition(async () => {
            const result = await saveProofOfHumanityVerificationAction({
                subjectDid: circle.did!,
                level,
                note,
                acknowledgedPublic,
            });

            if (!result.success) {
                toast({
                    title: "Could not save verification",
                    description: result.message,
                    variant: "destructive",
                    icon: "error",
                });
                return;
            }

            toast({
                title: "Verification saved",
                description: result.message,
                icon: "success",
            });
            setIsDialogOpen(false);
            router.refresh();
        });
    };

    const handleRemove = () => {
        startTransition(async () => {
            const result = await removeProofOfHumanityVerificationAction(circle.did!);
            if (!result.success) {
                toast({
                    title: "Could not remove verification",
                    description: result.message,
                    variant: "destructive",
                    icon: "error",
                });
                return;
            }

            toast({
                title: "Verification removed",
                description: result.message,
                icon: "success",
            });
            setIsDialogOpen(false);
            router.refresh();
        });
    };

    return (
        <>
            <div id="proof-of-humanity" className="flex flex-col rounded-[15px] border-0 bg-muted/20 p-6 shadow-lg">
                <div>
                    <h2 className="text-base font-semibold text-foreground">Proof of Humanity</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{summaryLine}</p>
                </div>

                <button
                    type="button"
                    className="mt-4 flex w-full items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
                    onClick={() => setIsExpanded((current) => !current)}
                    aria-expanded={isExpanded}
                    aria-controls="proof-of-humanity-details"
                >
                    <span>Verifications</span>
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                </button>

                {isExpanded && (
                    <div id="proof-of-humanity-details" className="mt-5">
                        <div className="space-y-2 rounded-xl border border-border/60 bg-background px-3 py-3">
                            <div className="text-sm font-medium text-foreground">Counts</div>
                            <div className="text-sm text-muted-foreground">
                                {formatCountLabel(summary.realPersonCount, "real person", "real people")}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {formatCountLabel(summary.metInRealLifeCount, "met in real life", "met in real life")}
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="mb-2 text-sm font-medium text-foreground">Public verifiers</div>
                            {summary.verifications.length > 0 ? (
                                <div className="space-y-3">
                                    {summary.verifications.map((verification) => (
                                        <VerifierRow key={String(verification._id)} verification={verification} />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No public confirmations yet.</p>
                            )}
                        </div>

                        {viewerVerification && (
                            <div className="mt-5 rounded-xl border border-border/60 bg-background px-3 py-3">
                                <div className="text-sm font-medium text-foreground">Your verification</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {viewerVerification.level === "met_in_real_life"
                                        ? "You have publicly confirmed that you have met this person in real life."
                                        : "You have publicly confirmed that this is a real person."}
                                </div>
                                {viewerVerification.note && (
                                    <p className="mt-2 text-sm text-foreground">
                                        &ldquo;{viewerVerification.note}&rdquo;
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="mt-5 flex flex-wrap gap-2">
                            {summary.canCurrentViewerVerify && !viewerVerification && (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setLevel("real_person");
                                        setNote("");
                                        setAcknowledgedPublic(false);
                                        setIsDialogOpen(true);
                                    }}
                                >
                                    Verify Human
                                </Button>
                            )}
                            {summary.canCurrentViewerVerify && viewerVerification && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setLevel(viewerVerification.level);
                                            setNote(viewerVerification.note ?? "");
                                            setAcknowledgedPublic(false);
                                            setIsDialogOpen(true);
                                        }}
                                    >
                                        Update your verification
                                    </Button>
                                    <Button variant="ghost" onClick={handleRemove} disabled={isPending}>
                                        Remove your verification
                                    </Button>
                                </>
                            )}
                            {summary.isOwnProfile && !viewerVerification && (
                                <p className="text-sm text-muted-foreground">You cannot verify your own profile.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>{viewerVerification ? "Update your verification" : "Verify Human"}</DialogTitle>
                        <DialogDescription>
                            Choose the level of public confirmation you want to give for this profile.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        <div className="space-y-3">
                            <Label>Verification level</Label>
                            <RadioGroup
                                value={level}
                                onValueChange={(value) => setLevel(value as HumanityVerificationLevel)}
                            >
                                <div className="flex items-start gap-3 rounded-lg border p-3">
                                    <RadioGroupItem value="real_person" id="proof-level-real-person" />
                                    <Label htmlFor="proof-level-real-person" className="cursor-pointer leading-5">
                                        I confirm this is a real person
                                    </Label>
                                </div>
                                <div className="flex items-start gap-3 rounded-lg border p-3">
                                    <RadioGroupItem value="met_in_real_life" id="proof-level-met-in-real-life" />
                                    <Label htmlFor="proof-level-met-in-real-life" className="cursor-pointer leading-5">
                                        I have met this person in real life
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="proof-note">Optional short note</Label>
                            <Textarea
                                id="proof-note"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                maxLength={280}
                                placeholder="Optional context that will be shown publicly."
                            />
                        </div>

                        <div className="flex items-start gap-3 rounded-lg border p-3">
                            <Checkbox
                                id="proof-public-ack"
                                checked={acknowledgedPublic}
                                onCheckedChange={(checked) => setAcknowledgedPublic(Boolean(checked))}
                            />
                            <Label htmlFor="proof-public-ack" className="cursor-pointer leading-5">
                                I understand this verification will be public.
                            </Label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isPending}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isPending || !acknowledgedPublic}>
                            {isPending ? "Saving..." : viewerVerification ? "Save changes" : "Submit verification"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function VerifierRow({ verification }: { verification: HumanityVerificationDisplay }) {
    const verifierName = verification.verifier?.name || verification.verifier?.handle || verification.verifierDid;
    const levelLabel = verification.level === "met_in_real_life" ? "Met in real life" : "Confirmed real person";

    return (
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
            <div className="flex items-center justify-between gap-3">
                {verification.verifier?.handle ? (
                    <Link
                        href={`/circles/${verification.verifier.handle}`}
                        className="font-medium text-foreground hover:underline"
                    >
                        {verifierName}
                    </Link>
                ) : (
                    <div className="font-medium text-foreground">{verifierName}</div>
                )}
                <Badge variant={verification.level === "met_in_real_life" ? "default" : "secondary"}>
                    {levelLabel}
                </Badge>
            </div>
            {verification.note && (
                <p className="mt-2 text-sm text-muted-foreground">&ldquo;{verification.note}&rdquo;</p>
            )}
        </div>
    );
}

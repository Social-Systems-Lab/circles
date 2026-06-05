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

const headerHumanButtonClassName =
    "h-8 rounded-full border-transparent bg-[#1f6b45] px-3 text-white hover:bg-[#19573a] hover:text-white";
const headerVerifyHumanButtonClassName =
    "h-8 rounded-full border-[#1f6b45] bg-transparent px-3 text-[#1f6b45] hover:border-[#19573a] hover:bg-[#e8f4ec] hover:text-[#19573a]";
const primaryActionButtonClassName =
    "rounded-full border-transparent bg-[#1f6b45] text-white hover:bg-[#19573a] hover:text-white";
const verificationBadgeClassName =
    "border-[#93ab83] bg-[#edf4e7] text-[#42553b] hover:border-[#809771] hover:bg-[#e5efdc] hover:text-[#384831]";

const getVerificationSelections = (level?: HumanityVerificationLevel | null) => ({
    confirmsRealPerson: Boolean(level),
    confirmsMetInPerson: level === "met_in_real_life",
});

const getVerificationLevel = ({
    confirmsRealPerson,
    confirmsMetInPerson,
}: {
    confirmsRealPerson: boolean;
    confirmsMetInPerson: boolean;
}): HumanityVerificationLevel | null => {
    if (confirmsMetInPerson) {
        return "met_in_real_life";
    }

    if (confirmsRealPerson) {
        return "real_person";
    }

    return null;
};

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
            <Button asChild variant="outline" size="sm" className={headerHumanButtonClassName}>
                <Link href={`/circles/${circle.handle}/home#proof-of-humanity`}>✓ Human</Link>
            </Button>
        );
    }

    if (!summary.canCurrentViewerVerify) {
        return null;
    }

    return (
        <Button asChild variant="outline" size="sm" className={headerVerifyHumanButtonClassName}>
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
    const [confirmsRealPerson, setConfirmsRealPerson] = useState(
        getVerificationSelections(summary.viewerVerification?.level).confirmsRealPerson,
    );
    const [confirmsMetInPerson, setConfirmsMetInPerson] = useState(
        getVerificationSelections(summary.viewerVerification?.level).confirmsMetInPerson,
    );
    const [note, setNote] = useState(summary.viewerVerification?.note ?? "");
    const [acknowledgedPublic, setAcknowledgedPublic] = useState(false);

    const viewerVerification = summary.viewerVerification;
    const selectedLevel = getVerificationLevel({ confirmsRealPerson, confirmsMetInPerson });
    const summaryLine = `Confirmed by ${summary.totalActiveCount} ${summary.totalActiveCount === 1 ? "person" : "people"}`;

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
            if (!selectedLevel) {
                toast({
                    title: "Choose at least one confirmation",
                    description: "Select a confirmation before saving your verification.",
                    variant: "destructive",
                    icon: "error",
                });
                return;
            }

            const result = await saveProofOfHumanityVerificationAction({
                subjectDid: circle.did!,
                level: selectedLevel,
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
                        <div>
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
                                        ? "You have publicly confirmed that you have met this person physically, in person."
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
                                    className={primaryActionButtonClassName}
                                    onClick={() => {
                                        setConfirmsRealPerson(true);
                                        setConfirmsMetInPerson(false);
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
                                            const selections = getVerificationSelections(viewerVerification.level);
                                            setConfirmsRealPerson(selections.confirmsRealPerson);
                                            setConfirmsMetInPerson(selections.confirmsMetInPerson);
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
                            <Label>Public confirmations</Label>
                            <div className="space-y-3">
                                <div className="flex items-start gap-3 rounded-lg border p-3">
                                    <Checkbox
                                        id="proof-level-real-person"
                                        checked={confirmsRealPerson}
                                        onCheckedChange={(checked) => {
                                            const isChecked = Boolean(checked);
                                            setConfirmsRealPerson(isChecked);
                                            if (!isChecked) {
                                                setConfirmsMetInPerson(false);
                                            }
                                        }}
                                    />
                                    <Label htmlFor="proof-level-real-person" className="cursor-pointer leading-5">
                                        I confirm this is a real person
                                    </Label>
                                </div>
                                <div className="flex items-start gap-3 rounded-lg border p-3">
                                    <Checkbox
                                        id="proof-level-met-in-real-life"
                                        checked={confirmsMetInPerson}
                                        onCheckedChange={(checked) => {
                                            const isChecked = Boolean(checked);
                                            setConfirmsMetInPerson(isChecked);
                                            if (isChecked) {
                                                setConfirmsRealPerson(true);
                                            }
                                        }}
                                    />
                                    <Label htmlFor="proof-level-met-in-real-life" className="cursor-pointer leading-5">
                                        We have met physically, in person
                                    </Label>
                                </div>
                            </div>
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
                        <Button
                            className={primaryActionButtonClassName}
                            onClick={handleSave}
                            disabled={isPending || !acknowledgedPublic || !selectedLevel}
                        >
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
    const levelLabel = verification.level === "met_in_real_life" ? "Met in real life" : "Real person";

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
                <Badge variant="outline" className={verificationBadgeClassName}>
                    {levelLabel}
                </Badge>
            </div>
            {verification.note && (
                <p className="mt-2 text-sm text-muted-foreground">&ldquo;{verification.note}&rdquo;</p>
            )}
        </div>
    );
}

"use client";

import QRCode from "react-qr-code";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, Copy, ExternalLink, KeyRound, Loader2, QrCode, Smartphone, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { isVibeIdEnabled } from "@/lib/vibe-id/config";
import type { Circle } from "@/models/models";
import type { PlatformMembershipCredentialCardData } from "@/lib/vibe-id/membership-credentials";

type VibeIdRequest = {
    requestId: string;
    deepLinkUrl: string;
    statusUrl: string;
};

type VibeIdStatusResponse = {
    status: "pending" | "approved" | "needs_signup" | "linked" | "rejected" | "failed" | "expired";
    vibeDid?: string;
    profile?: VibeIdProfile;
    message?: string;
    error?: string;
};

type VibeIdProfile = {
    displayName?: string;
    initials?: string;
    avatarUrl?: string;
};

type LinkedVibeId = {
    did: string;
    profile?: VibeIdProfile;
};

function getLinkedVibeId(user: Circle): LinkedVibeId | undefined {
    const metadata = user.metadata as { authProviders?: { vibeId?: { did?: string; profile?: VibeIdProfile } } } | undefined;
    const vibeId = metadata?.authProviders?.vibeId;
    return vibeId?.did ? { did: vibeId.did, profile: vibeId.profile } : undefined;
}

function formatDidChip(did: string): string {
    if (did.length <= 20) {
        return did;
    }

    return `${did.slice(0, 14)}...${did.slice(-8)}`;
}

export function VibeIdSettingsCard({
    user,
    membershipCredential,
}: {
    user: Circle;
    membershipCredential?: PlatformMembershipCredentialCardData | null;
}) {
    const vibeIdEnabled = isVibeIdEnabled();
    const { toast } = useToast();
    const [linkedVibeId, setLinkedVibeId] = useState(getLinkedVibeId(user));
    const [copied, setCopied] = useState(false);
    const [credentialCopied, setCredentialCopied] = useState(false);
    const [isMembershipQrVisible, setIsMembershipQrVisible] = useState(false);
    const [requestData, setRequestData] = useState<VibeIdRequest | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [statusText, setStatusText] = useState("Waiting for approval in VibeID.");
    const pollTimerRef = useRef<number | null>(null);

    const closePrompt = () => {
        if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        setRequestData(null);
        setStatusText("Waiting for approval in VibeID.");
    };

    useEffect(() => {
        return () => {
            if (pollTimerRef.current) {
                window.clearInterval(pollTimerRef.current);
            }
        };
    }, []);

    if (!vibeIdEnabled) {
        return null;
    }

    const pollStatus = async (statusUrl: string) => {
        try {
            const response = await fetch(statusUrl, { cache: "no-store" });
            const result = (await response.json()) as VibeIdStatusResponse;

            if (result.status === "linked") {
                closePrompt();
                setLinkedVibeId(result.vibeDid ? { did: result.vibeDid, profile: result.profile } : getLinkedVibeId(user));
                toast({ title: "VibeID connected" });
                return;
            }

            if (result.status === "rejected") {
                setStatusText("The VibeID request was rejected.");
                if (pollTimerRef.current) {
                    window.clearInterval(pollTimerRef.current);
                    pollTimerRef.current = null;
                }
                return;
            }

            if (result.status === "failed" || result.status === "expired") {
                setStatusText(result.message || "The VibeID request could not be completed.");
                if (pollTimerRef.current) {
                    window.clearInterval(pollTimerRef.current);
                    pollTimerRef.current = null;
                }
            }
        } catch (error) {
            setStatusText(error instanceof Error ? error.message : "Could not check the VibeID request.");
        }
    };

    const startLink = async () => {
        setIsStarting(true);
        try {
            const response = await fetch("/api/vibe-id/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ intent: "link" }),
            });
            if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error(result?.message || "Could not start VibeID connection.");
            }

            const nextRequest = (await response.json()) as VibeIdRequest;
            setRequestData(nextRequest);
            setStatusText("Waiting for approval in VibeID.");

            if (pollTimerRef.current) {
                window.clearInterval(pollTimerRef.current);
            }
            pollTimerRef.current = window.setInterval(() => {
                void pollStatus(nextRequest.statusUrl);
            }, 1500);
            void pollStatus(nextRequest.statusUrl);
        } catch (error) {
            toast({
                title: "VibeID unavailable",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsStarting(false);
        }
    };

    const copyDid = async () => {
        if (!linkedVibeId?.did) {
            return;
        }

        await navigator.clipboard.writeText(linkedVibeId.did);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const copyCredential = async () => {
        if (!membershipCredential) {
            return;
        }

        await navigator.clipboard.writeText(membershipCredential.deepLinkUrl);
        setCredentialCopied(true);
        window.setTimeout(() => setCredentialCopied(false), 1500);
    };

    const profileLabel = linkedVibeId?.profile?.displayName || user.name || "VibeID";
    const initials = linkedVibeId?.profile?.initials || profileLabel.slice(0, 2).toUpperCase();

    return (
        <>
            <Card>
                <CardHeader className="space-y-2 pb-5">
                    <CardTitle className="text-2xl font-semibold tracking-tight">VibeID</CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-6">
                        Connect VibeID to this Peerify account so you can sign in without your password.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {linkedVibeId ? (
                        <>
                            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    {linkedVibeId.profile?.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={linkedVibeId.profile.avatarUrl}
                                            alt=""
                                            className="h-10 w-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9e7ff] text-sm font-semibold text-[#0b1020]">
                                            {initials}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-foreground">{profileLabel}</div>
                                        <div className="mt-1 inline-flex max-w-full items-center gap-2 rounded-full border bg-white px-2.5 py-1 font-mono text-xs text-muted-foreground">
                                            <span className="truncate">{formatDidChip(linkedVibeId.did)}</span>
                                        </div>
                                    </div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={copyDid}>
                                    {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                                    {copied ? "Copied" : "Copy DID"}
                                </Button>
                            </div>

                            <div className="rounded-xl border bg-white p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            <WalletCards className="h-4 w-4" />
                                            Credential
                                        </div>
                                        <div className="text-base font-semibold text-foreground">Peerify membership</div>
                                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                                            Claim this credential in VibeID to keep a signed proof of your active Peerify membership.
                                        </p>
                                    </div>
                                    <Badge variant={membershipCredential ? "outline" : "secondary"} className="w-fit gap-1">
                                        <BadgeCheck className="h-3.5 w-3.5" />
                                        {membershipCredential ? "Available" : "Membership inactive"}
                                    </Badge>
                                </div>

                                {membershipCredential ? (
                                    <div className="mt-4 space-y-3">
                                        {isMembershipQrVisible ? (
                                            <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-lg border bg-white p-3 sm:mx-0">
                                                <QRCode value={membershipCredential.deepLinkUrl} size={196} />
                                            </div>
                                        ) : null}

                                        <div className="grid gap-2 sm:grid-cols-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setIsMembershipQrVisible((visible) => !visible)}
                                            >
                                                <QrCode className="mr-2 h-4 w-4" />
                                                {isMembershipQrVisible ? "Hide QR" : "Show QR"}
                                            </Button>
                                            <Button type="button" variant="outline" asChild>
                                                <a href={membershipCredential.deepLinkUrl}>
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    Open VibeID
                                                </a>
                                            </Button>
                                            <Button type="button" variant="outline" onClick={copyCredential}>
                                                {credentialCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                                                {credentialCopied ? "Copied" : "Copy"}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        A membership credential becomes available here when your Peerify membership is active.
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                            No VibeID is connected yet.
                        </div>
                    )}

                    <div className="flex justify-end">
                    <Button type="button" variant={linkedVibeId ? "outline" : "default"} disabled={isStarting} onClick={startLink}>
                        {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        {linkedVibeId ? "Reconnect VibeID" : "Connect VibeID"}
                    </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={Boolean(requestData)} onOpenChange={(open) => (!open ? closePrompt() : undefined)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Connect VibeID</DialogTitle>
                        <DialogDescription>Scan the code or open VibeID on this device.</DialogDescription>
                    </DialogHeader>

                    {requestData ? (
                        <div className="space-y-5">
                            <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-lg border bg-white p-3">
                                <QRCode value={requestData.deepLinkUrl} size={196} />
                            </div>

                            <Button asChild className="w-full gap-2">
                                <a href={requestData.deepLinkUrl}>
                                    <Smartphone className="h-4 w-4" />
                                    Open VibeID
                                </a>
                            </Button>

                            <p className="text-center text-sm text-muted-foreground">{statusText}</p>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}

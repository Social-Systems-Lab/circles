"use client";

import QRCode from "react-qr-code";
import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { Circle } from "@/models/models";

type VibeIdRequest = {
    requestId: string;
    deepLinkUrl: string;
    statusUrl: string;
};

type VibeIdStatusResponse = {
    status: "pending" | "approved" | "needs_signup" | "linked" | "rejected" | "failed" | "expired";
    message?: string;
    error?: string;
};

function getLinkedVibeDid(user: Circle): string | undefined {
    const metadata = user.metadata as { authProviders?: { vibeId?: { did?: string } } } | undefined;
    return metadata?.authProviders?.vibeId?.did;
}

export function VibeIdSettingsCard({ user }: { user: Circle }) {
    const { toast } = useToast();
    const [linkedDid, setLinkedDid] = useState(getLinkedVibeDid(user));
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

    const pollStatus = async (statusUrl: string) => {
        try {
            const response = await fetch(statusUrl, { cache: "no-store" });
            const result = (await response.json()) as VibeIdStatusResponse;

            if (result.status === "linked") {
                closePrompt();
                setLinkedDid("connected");
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

    return (
        <>
            <Card>
                <CardHeader className="space-y-2 pb-5">
                    <CardTitle className="text-2xl font-semibold tracking-tight">VibeID</CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-6">
                        Connect VibeID to this Kamooni account so you can sign in without your password.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                        {linkedDid ? "VibeID is connected to this account." : "No VibeID is connected yet."}
                    </div>
                    <Button type="button" variant={linkedDid ? "outline" : "default"} disabled={isStarting} onClick={startLink}>
                        {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        {linkedDid ? "Reconnect VibeID" : "Connect VibeID"}
                    </Button>
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

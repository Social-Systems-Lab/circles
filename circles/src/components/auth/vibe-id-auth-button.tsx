"use client";

import QRCode from "react-qr-code";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Smartphone } from "lucide-react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import type { UserPrivate } from "@/models/models";

type VibeIdRequest = {
    requestId: string;
    deepLinkUrl: string;
    statusUrl: string;
    expiresAt: number;
};

type VibeIdStatusResponse = {
    status: "pending" | "approved" | "needs_signup" | "linked" | "rejected" | "failed" | "expired";
    user?: UserPrivate;
    profile?: {
        displayName?: string;
    };
    message?: string;
    error?: string;
};

type VibeIdNeedsSignupDetails = {
    requestId: string;
    profile?: VibeIdStatusResponse["profile"];
};

type VibeIdAuthButtonProps = {
    label?: string;
    onNeedsSignup?: (details: VibeIdNeedsSignupDetails) => void;
};

export function VibeIdAuthButton({ label = "Continue with VibeID", onNeedsSignup }: VibeIdAuthButtonProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [, setAuthInfo] = useAtom(authInfoAtom);
    const [requestData, setRequestData] = useState<VibeIdRequest | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [statusText, setStatusText] = useState("Waiting for approval in VibeID.");
    const pollTimerRef = useRef<number | null>(null);

    const getRequestIdFromStatusUrl = (statusUrl: string) => {
        const encodedRequestId = statusUrl.split("/").filter(Boolean).pop();
        return encodedRequestId ? decodeURIComponent(encodedRequestId) : "";
    };

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

    const finishAuthentication = (user: UserPrivate) => {
        setUser(user);
        setAuthInfo((prev) => ({ ...prev, authStatus: "authenticated" }));
        closePrompt();

        toast({
            title: "VibeID sign-in complete",
            description: "Welcome to Kamooni.",
        });

        const redirectUrl = searchParams?.get("redirectTo") ?? `/circles/${user.handle}`;
        router.push(redirectUrl);
        router.refresh();
    };

    const pollStatus = async (statusUrl: string, activeRequestData = requestData) => {
        try {
            const response = await fetch(statusUrl, { cache: "no-store" });
            const result = (await response.json()) as VibeIdStatusResponse;

            if (result.status === "approved" && result.user) {
                finishAuthentication(result.user);
                return;
            }

            if (result.status === "needs_signup") {
                const requestId = activeRequestData?.requestId || getRequestIdFromStatusUrl(statusUrl);
                if (pollTimerRef.current) {
                    window.clearInterval(pollTimerRef.current);
                    pollTimerRef.current = null;
                }

                if (onNeedsSignup && requestId) {
                    onNeedsSignup({ requestId, profile: result.profile });
                    closePrompt();
                    return;
                }

                if (requestId) {
                    const params = new URLSearchParams();
                    params.set("vibeIdRequestId", requestId);
                    if (result.profile?.displayName) {
                        params.set("vibeIdName", result.profile.displayName);
                    }
                    const redirectTo = searchParams?.get("redirectTo");
                    if (redirectTo) {
                        params.set("redirectTo", redirectTo);
                    }
                    closePrompt();
                    router.push(`/signup?${params.toString()}`);
                    return;
                }

                setStatusText("Continue in the Kamooni signup flow to finish creating your account.");
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

    const startSignIn = async () => {
        setIsStarting(true);
        try {
            const response = await fetch("/api/vibe-id/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error("Could not start VibeID sign-in.");
            }

            const nextRequest = (await response.json()) as VibeIdRequest;
            setRequestData(nextRequest);
            setStatusText("Waiting for approval in VibeID.");

            if (pollTimerRef.current) {
                window.clearInterval(pollTimerRef.current);
            }
            pollTimerRef.current = window.setInterval(() => {
                void pollStatus(nextRequest.statusUrl, nextRequest);
            }, 1500);
            void pollStatus(nextRequest.statusUrl, nextRequest);
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
            <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-[#4c7cf3]/40 bg-white text-kam-gray-dark hover:bg-[#eef4ff]"
                disabled={isStarting}
                onClick={startSignIn}
            >
                {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {label}
            </Button>

            <Dialog open={Boolean(requestData)} onOpenChange={(open) => (!open ? closePrompt() : undefined)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Continue with VibeID</DialogTitle>
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

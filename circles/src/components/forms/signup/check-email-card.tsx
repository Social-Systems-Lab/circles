"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignupBrand } from "@/components/forms/signup/signup-brand";
import {
    correctPendingRegistrationEmailAction,
    resendPendingRegistrationAction,
    resumePendingRegistrationAction,
} from "@/components/forms/signup/pending-actions";

type PreviewState = "default" | "error" | "loading";

export function CheckEmailCard({
    preview = false,
    sampleEmail = "alex@example.org",
    previewState = "default",
}: {
    preview?: boolean;
    sampleEmail?: string;
    previewState?: PreviewState;
}) {
    const params = useSearchParams();
    const verificationState = params.get("verification");
    const [email, setEmail] = useState(preview ? sampleEmail : "");
    const [newEmail, setNewEmail] = useState(preview ? sampleEmail : "");
    const [resendAt, setResendAt] = useState<number | null>(null);
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (preview) {
            setEmail(sampleEmail);
            setNewEmail(sampleEmail);
            setResendAt(Date.now() + 45_000);
            const timer = window.setInterval(() => setNow(Date.now()), 1000);
            return () => window.clearInterval(timer);
        }
        void resumePendingRegistrationAction().then((state) => {
            if (state.success && state.email) {
                setEmail(state.email);
                setNewEmail(state.email);
                if (state.resendAvailableAt) setResendAt(Date.parse(state.resendAvailableAt));
                if (["invalid", "expired"].includes(verificationState || "")) {
                    setMessage("That verification link expired or is no longer valid. Request a fresh link below.");
                }
            } else {
                setMessage(
                    ["invalid", "expired"].includes(verificationState || "")
                        ? "That verification link expired or is no longer valid. Start again or sign in if you already have an account."
                        : "We couldn’t find an active signup in this browser. Start again or sign in if you already have an account.",
                );
            }
        });
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [preview, sampleEmail, verificationState]);

    const seconds = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;
    async function resend() {
        if (preview) {
            setResendAt(Date.now() + 45_000);
            setMessage("Preview only — no verification email was sent.");
            return;
        }
        setBusy(true);
        try {
            const result = await resendPendingRegistrationAction();
            setResendAt(result.resendAvailableAt ? Date.parse(result.resendAvailableAt) : Date.now() + 60_000);
            setMessage("If this signup can continue, a fresh verification link will arrive shortly.");
        } finally {
            setBusy(false);
        }
    }
    async function correct(event: React.FormEvent) {
        event.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
            setMessage("Enter a valid email address.");
            return;
        }
        if (preview) {
            setEmail(newEmail.trim());
            setEditing(false);
            setResendAt(Date.now() + 45_000);
            setMessage("Preview only — the displayed address changed locally; no email was sent.");
            return;
        }
        setBusy(true);
        try {
            const result = await correctPendingRegistrationEmailAction(newEmail.trim());
            const currentEmail = result.email || email;
            setEmail(currentEmail);
            if (result.resendAvailableAt) setResendAt(Date.parse(result.resendAvailableAt));
            if (result.email?.toLowerCase() === newEmail.trim().toLowerCase()) {
                setEditing(false);
                setMessage("If this signup can continue, a new verification link will arrive shortly.");
            } else {
                setMessage("We couldn’t update that address yet. Check it and try again, or wait before retrying.");
            }
        } finally {
            setBusy(false);
        }
    }

    const previewBusy = preview && previewState === "loading";

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-3 sm:p-6">
            <Card className="w-full max-w-md rounded-2xl">
                <CardHeader>
                    <SignupBrand />
                    <CardTitle className="text-2xl">Check your email</CardTitle>
                    <CardDescription>
                        We sent a link to verify your email. Open it on any device to continue.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {preview && (
                        <p className="rounded-lg bg-muted p-3 text-sm" role="status">
                            Development preview · resend and email correction are simulated locally.
                        </p>
                    )}
                    {email && (
                        <p
                            className="break-all rounded-lg bg-muted p-4 text-center text-base font-semibold sm:text-lg"
                            aria-label="Verification email address"
                        >
                            {email}
                        </p>
                    )}
                    {editing ? (
                        <form onSubmit={correct} className="space-y-3">
                            <Label htmlFor="correct-email">Correct email address</Label>
                            <Input
                                id="correct-email"
                                type="email"
                                autoComplete="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="min-h-12"
                                required
                            />
                            <Button type="submit" disabled={busy || previewBusy} className="min-h-12 w-full">
                                {busy || previewBusy ? "Updating…" : "Send link to this email"}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setEditing(false)}
                                disabled={previewBusy}
                                className="min-h-11 w-full"
                            >
                                Cancel
                            </Button>
                        </form>
                    ) : (
                        <>
                            <Button
                                type="button"
                                onClick={resend}
                                disabled={busy || previewBusy || seconds > 0 || !email}
                                className={`min-h-12 w-full ${seconds > 0 ? "bg-muted text-muted-foreground hover:bg-muted disabled:opacity-100" : ""}`}
                            >
                                {busy || previewBusy
                                    ? "Sending…"
                                    : seconds > 0
                                      ? `Resend available in ${seconds}s`
                                      : "Resend verification email"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditing(true)}
                                disabled={!email || previewBusy}
                                className="min-h-12 w-full"
                            >
                                Correct email address
                            </Button>
                        </>
                    )}
                    <p className="text-sm text-muted-foreground">
                        Didn&apos;t get the email? Check your spam folder or request a new link.
                    </p>
                    <Link className="block text-center text-sm underline" href="/signup/recover">
                        Recover a previously verified signup
                    </Link>
                    {message && (
                        <p role="status" className="text-sm text-muted-foreground">
                            {message}
                        </p>
                    )}
                    {preview && previewState === "error" && !message && (
                        <p role="alert" className="text-sm text-destructive">
                            This signup link may have expired. Request a fresh link or return to signup.
                        </p>
                    )}
                    <div className="flex items-center justify-between text-sm">
                        <Link
                            className="underline"
                            href={`/signup${params.get("redirectTo") ? `?redirectTo=${encodeURIComponent(params.get("redirectTo")!)}` : ""}`}
                        >
                            Back to signup
                        </Link>
                        <Link className="underline" href="/login">
                            Sign in
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}

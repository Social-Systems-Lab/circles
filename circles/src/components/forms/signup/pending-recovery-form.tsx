"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requestPendingRegistrationRecoveryAction } from "@/components/forms/signup/pending-actions";
import { SignupBrand } from "@/components/forms/signup/signup-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GENERIC = "If this verified signup can continue, a fresh verification link will arrive shortly.";

export function PendingRecoveryForm() {
    const altchaRef = useRef<HTMLElement | null>(null);
    const [email, setEmail] = useState("");
    const [altcha, setAltcha] = useState("");
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        void import("altcha");
        fetch("/api/altcha/challenge", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : Promise.reject()))
            .then((challenge) => altchaRef.current?.setAttribute("challenge", JSON.stringify(challenge)))
            .catch(() => setMessage("Verification is temporarily unavailable. Please try again."));
        const widget = altchaRef.current;
        const update = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            setAltcha(detail?.state === "verified" && typeof detail.payload === "string" ? detail.payload : "");
        };
        widget?.addEventListener("statechange", update);
        return () => widget?.removeEventListener("statechange", update);
    }, []);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setMessage("Enter a valid email address.");
            return;
        }
        if (!altcha) {
            setMessage("Complete the human-verification check.");
            return;
        }
        setBusy(true);
        setMessage("");
        try {
            await requestPendingRegistrationRecoveryAction({ email: email.trim(), altcha });
            setSubmitted(true);
            setMessage(GENERIC);
        } catch {
            setSubmitted(true);
            setMessage(GENERIC);
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-3 sm:p-6">
            <Card className="w-full max-w-md rounded-2xl">
                <CardHeader className="space-y-3">
                    <SignupBrand />
                    <CardTitle className="text-2xl">Continue your signup</CardTitle>
                    <CardDescription>
                        If your password setup expired after email verification, request a fresh secure link.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {!submitted ? (
                        <form onSubmit={submit} noValidate className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="recovery-email">Email address</Label>
                                <Input
                                    id="recovery-email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="min-h-12"
                                />
                            </div>
                            <altcha-widget ref={altchaRef as never} challenge=""></altcha-widget>
                            <Button type="submit" disabled={busy} className="min-h-12 w-full">
                                {busy ? "Requesting…" : "Email me a fresh link"}
                            </Button>
                        </form>
                    ) : (
                        <Button asChild className="min-h-12 w-full">
                            <Link href="/login">Continue to sign in</Link>
                        </Button>
                    )}
                    {message && (
                        <p role="status" className="rounded-lg bg-muted p-4 text-sm">
                            {message}
                        </p>
                    )}
                    <div className="flex flex-col gap-3 text-center text-sm">
                        <Link className="underline" href="/signup">
                            Start a new signup
                        </Link>
                        <Link className="underline" href="/login">
                            Sign in instead
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}

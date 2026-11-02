"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignupBrand } from "@/components/forms/signup/signup-brand";
import {
    startPendingRegistrationAction,
    resumePendingRegistrationAction,
} from "@/components/forms/signup/pending-actions";

type Errors = Partial<Record<"name" | "email" | "handle" | "altcha", string>>;
type PreviewState = "default" | "error" | "loading";

function validate(name: string, email: string, handle: string): Errors {
    const errors: Errors = {};
    if (name.trim().length < 2 || name.trim().length > 100) errors.name = "Enter your name (2–100 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle.trim().toLowerCase()) ||
        handle.trim().length < 3 ||
        handle.trim().length > 20
    )
        errors.handle = "Use 3–20 lowercase letters, numbers, or single hyphens.";
    return errors;
}

function internalRedirect(value: string | null) {
    if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
    try {
        const parsed = new URL(value, window.location.origin);
        return parsed.origin === window.location.origin
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : undefined;
    } catch {
        return undefined;
    }
}

export function PendingSignupForm({
    preview = false,
    previewState = "default",
}: {
    preview?: boolean;
    previewState?: PreviewState;
}) {
    const params = useSearchParams();
    const altchaRef = useRef<HTMLElement | null>(null);
    const [altcha, setAltcha] = useState("");
    const [name, setName] = useState(preview ? "Alex Morgan" : "");
    const [email, setEmail] = useState(preview ? "alex@example.org" : "");
    const [handle, setHandle] = useState(preview ? "alex-morgan" : "");
    const [errors, setErrors] = useState<Errors>({});
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (preview) return;
        void import("altcha");
        fetch("/api/altcha/challenge", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((challenge) => {
                if (altchaRef.current) altchaRef.current.setAttribute("challenge", JSON.stringify(challenge));
            })
            .catch(() => setMessage("Verification is temporarily unavailable. Please try again."));
        const el = altchaRef.current;
        const update = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            setAltcha(detail?.state === "verified" && typeof detail.payload === "string" ? detail.payload : "");
        };
        el?.addEventListener("statechange", update);
        return () => el?.removeEventListener("statechange", update);
    }, [preview]);

    useEffect(() => {
        if (preview) return;
        if (params.get("verification") === "confirmed")
            setMessage("Your email is verified. Continue to create your password.");
        else if (["invalid", "expired"].includes(params.get("verification") || ""))
            setMessage(
                "That verification link is invalid or has expired. You can return to the email options or sign in if you already have an account.",
            );
        void resumePendingRegistrationAction().then((result) =>
            setReady(Boolean(result.success && result.status === "pending_email")),
        );
    }, [params, preview]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (preview) {
            setMessage("Preview only — registration is disabled here.");
            return;
        }
        const next = validate(name, email, handle);
        if (!altcha) next.altcha = "Complete the human-verification check.";
        setErrors(next);
        if (Object.keys(next).length) return;
        setBusy(true);
        setMessage("");
        try {
            const result = await startPendingRegistrationAction({
                name: name.trim(),
                email: email.trim(),
                requestedHandle: handle.trim().toLowerCase(),
                altcha,
                redirectTo: internalRedirect(params.get("redirectTo")),
            });
            if (!result.success || !result.email) {
                setMessage(result.message || "We could not start signup. Please try again.");
                return;
            }
            window.location.assign(
                `/signup/check-email?redirectTo=${encodeURIComponent(internalRedirect(params.get("redirectTo")) || "")}`,
            );
        } catch {
            setMessage("We could not start signup. Please check your details and try again.");
        } finally {
            setBusy(false);
        }
    }

    const previewBusy = preview && previewState === "loading";

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-3 sm:p-6">
            <Card className="w-full max-w-md rounded-2xl">
                <CardHeader className="space-y-3">
                    <SignupBrand />
                    <CardTitle className="text-2xl">Find the others</CardTitle>
                    <CardDescription>Join a community where people turn shared hopes into action.</CardDescription>
                </CardHeader>
                <CardContent>
                    {preview && (
                        <p className="mb-4 rounded-lg bg-muted p-3 text-sm" role="status">
                            Development preview · no registration or verification requests are sent.
                        </p>
                    )}
                    <form onSubmit={submit} noValidate className="space-y-5">
                        {(
                            [
                                ["name", "Your name", name, setName, "Your name"],
                                ["email", "Email address", email, setEmail, "you@example.com"],
                                ["handle", "Choose a handle", handle, setHandle, "your-handle"],
                            ] as const
                        ).map(([key, label, value, setter, placeholder]) => (
                            <div className="space-y-2" key={key}>
                                <Label htmlFor={`pending-${key}`}>{label}</Label>
                                <Input
                                    id={`pending-${key}`}
                                    name={key}
                                    autoComplete={key === "name" ? "name" : key === "email" ? "email" : "username"}
                                    value={value}
                                    placeholder={placeholder}
                                    onChange={(e) => setter(e.target.value)}
                                    aria-invalid={Boolean(errors[key])}
                                    aria-describedby={errors[key] ? `${key}-error` : undefined}
                                    className="min-h-12"
                                />
                                {errors[key] && (
                                    <p id={`${key}-error`} role="alert" className="text-sm text-destructive">
                                        {errors[key]}
                                    </p>
                                )}
                                {key === "handle" && (
                                    <p className="text-xs text-muted-foreground">
                                        Your handle is your unique name on Kamooni. Others can use it to find you.
                                    </p>
                                )}
                            </div>
                        ))}
                        {!preview && (
                            <div className="space-y-2">
                                <altcha-widget ref={altchaRef as never} challenge=""></altcha-widget>
                                {errors.altcha && (
                                    <p role="alert" className="text-sm text-destructive">
                                        {errors.altcha}
                                    </p>
                                )}
                            </div>
                        )}
                        {(message || (preview && previewState === "error")) && (
                            <p role="status" className="text-sm text-muted-foreground">
                                {message || "We couldn’t start signup. Please review your details and try again."}
                            </p>
                        )}
                        {!preview && ["invalid", "expired"].includes(params.get("verification") || "") && (
                            <Link className="block text-sm font-medium underline" href="/signup/check-email">
                                Return to email options
                            </Link>
                        )}
                        {!preview && params.get("verification") === "confirmed" && (
                            <Link className="block text-sm font-medium underline" href="/signup/continue">
                                Create your password
                            </Link>
                        )}
                        <Button type="submit" disabled={busy || previewBusy} className="min-h-12 w-full">
                            {busy || previewBusy ? "Sending…" : "Continue with email"}
                        </Button>
                    </form>
                    {ready && (
                        <p className="mt-4 text-center text-sm">
                            <Link className="underline" href="/signup/check-email">
                                Continue your signup
                            </Link>
                        </p>
                    )}
                    <p className="mt-5 text-center text-sm text-muted-foreground">
                        Already with us?{" "}
                        <Link className="font-medium text-foreground underline" href="/login">
                            Sign in
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}

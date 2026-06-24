"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { submitSignupFormAction } from "@/components/forms/signup/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

type PilotSignupState = {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
    handle: string;
};

type PilotSignupErrors = Partial<Record<keyof PilotSignupState, string>>;

const initialState: PilotSignupState = {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    handle: "",
};

function sanitizeHandle(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]+/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getDefaultHandle(firstName: string, lastName: string) {
    return sanitizeHandle(`${firstName} ${lastName}`);
}

function getErrors(state: PilotSignupState): PilotSignupErrors {
    const errors: PilotSignupErrors = {};

    if (!state.firstName.trim()) {
        errors.firstName = "First name is required.";
    }

    if (!state.lastName.trim()) {
        errors.lastName = "Last name is required.";
    }

    if (!state.email.trim()) {
        errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) {
        errors.email = "Enter a valid email address.";
    }

    if (!state.password) {
        errors.password = "Password is required.";
    } else if (state.password.length < 8) {
        errors.password = "Password must be at least 8 characters.";
    }

    if (!state.confirmPassword) {
        errors.confirmPassword = "Please repeat your password.";
    } else if (state.password !== state.confirmPassword) {
        errors.confirmPassword = "Passwords do not match.";
    }

    const handle = sanitizeHandle(state.handle);
    if (!handle) {
        errors.handle = "Handle is required.";
    } else if (handle.length < 3) {
        errors.handle = "Handle must be at least 3 characters.";
    } else if (handle.length > 20) {
        errors.handle = "Handle can't be more than 20 characters.";
    } else if (!/^[a-z0-9-]+$/.test(handle)) {
        errors.handle = "Use lowercase letters, numbers, and hyphens only.";
    }

    return errors;
}

function normalizePeerifyIntent(value: string | null): "fan" | "artist" | "host" | null {
    return value === "fan" || value === "artist" || value === "host" ? value : null;
}

export function PilotSignupForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [, setAuthInfo] = useAtom(authInfoAtom);
    const [state, setState] = useState<PilotSignupState>(initialState);
    const [errors, setErrors] = useState<PilotSignupErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasEditedHandle, setHasEditedHandle] = useState(false);
    const altchaRef = useRef<HTMLElement | null>(null);
    const [altchaPayload, setAltchaPayload] = useState<string | null>(null);

    useEffect(() => {
        import("altcha");
    }, []);

    useEffect(() => {
        const el = altchaRef.current;
        if (!el) return;
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.state === "verified" && typeof detail.payload === "string") {
                setAltchaPayload(detail.payload);
            } else {
                setAltchaPayload(null);
            }
        };
        el.addEventListener("statechange", handler as EventListener);
        return () => el.removeEventListener("statechange", handler as EventListener);
    }, []);

    const updateField = (field: keyof PilotSignupState, value: string) => {
        setState((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    useEffect(() => {
        if (hasEditedHandle) {
            return;
        }

        const nextHandle = getDefaultHandle(state.firstName, state.lastName);
        setState((prev) => (prev.handle === nextHandle ? prev : { ...prev, handle: nextHandle }));
    }, [hasEditedHandle, state.firstName, state.lastName]);

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const nextErrors = getErrors(state);
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            return;
        }

        if (!altchaPayload) {
            toast({
                title: "Verification required",
                description: "Please complete the human-verification check.",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const fullName = `${state.firstName.trim()} ${state.lastName.trim()}`.trim();
            const result = await submitSignupFormAction({
                name: fullName,
                handle: sanitizeHandle(state.handle),
                _email: state.email.trim(),
                _password: state.password,
                altcha: altchaPayload,
                metadata: {
                    onboardingFlow: "pilot-quick-signup",
                },
            });

            if (!result.success) {
                const message = result.message || "An error occurred during signup.";
                if (message.toLowerCase().includes("handle")) {
                    setErrors({ handle: message });
                } else if (message.toLowerCase().includes("email")) {
                    setErrors({ email: message });
                } else {
                    toast({
                        title: "Signup failed",
                        description: message,
                        variant: "destructive",
                    });
                }
                return;
            }

            setUser(result.data.user);
            setAuthInfo((prev) => ({ ...prev, authStatus: "authenticated" }));

            toast({
                title: "Account created",
                description: "Now verify your email. You can continue into Peerify after that.",
            });

            const nextParams = new URLSearchParams();
            nextParams.set("email", state.email.trim());
            nextParams.set("handle", result.data.user.handle || sanitizeHandle(state.handle));

            const redirectTo = searchParams?.get("redirectTo");
            if (redirectTo) {
                nextParams.set("redirectTo", redirectTo);
            }

            const peerifyIntent = normalizePeerifyIntent(searchParams?.get("intent") ?? null);
            if (peerifyIntent) {
                nextParams.set("intent", peerifyIntent);
            }

            router.push(`/signup/pilot/check-email?${nextParams.toString()}`);
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#f7f2ea] px-4 py-10">
            <Card className="w-full max-w-md border-[#e3d5c2] bg-[#faf6ef] shadow-sm">
                <CardHeader className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e8720c]">Peerify Pilot Signup</p>
                    <CardTitle className="text-2xl text-[#181512]">Create your personal account</CardTitle>
                    <p className="text-sm text-[#6b5f52]">
                        Start with the essentials. You can choose what you want to do first on Peerify right after signup.
                    </p>
                </CardHeader>
                <CardContent>
                    <form className="space-y-5" onSubmit={onSubmit}>
                        <div className="grid gap-5 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="pilot-signup-first-name">First name</Label>
                                <Input
                                    id="pilot-signup-first-name"
                                    value={state.firstName}
                                    onChange={(event) => updateField("firstName", event.target.value)}
                                    autoComplete="given-name"
                                    placeholder="Jane"
                                />
                                {errors.firstName ? <p className="text-sm text-red-600">{errors.firstName}</p> : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pilot-signup-last-name">Last name</Label>
                                <Input
                                    id="pilot-signup-last-name"
                                    value={state.lastName}
                                    onChange={(event) => updateField("lastName", event.target.value)}
                                    autoComplete="family-name"
                                    placeholder="Smith"
                                />
                                {errors.lastName ? <p className="text-sm text-red-600">{errors.lastName}</p> : null}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pilot-signup-email">Email</Label>
                            <Input
                                id="pilot-signup-email"
                                type="email"
                                value={state.email}
                                onChange={(event) => updateField("email", event.target.value)}
                                autoComplete="email"
                                placeholder="you@example.com"
                            />
                            {errors.email ? <p className="text-sm text-red-600">{errors.email}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pilot-signup-password">Password</Label>
                            <Input
                                id="pilot-signup-password"
                                type="password"
                                value={state.password}
                                onChange={(event) => updateField("password", event.target.value)}
                                autoComplete="new-password"
                                placeholder="At least 8 characters"
                            />
                            {errors.password ? <p className="text-sm text-red-600">{errors.password}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pilot-signup-confirm-password">Confirm password</Label>
                            <Input
                                id="pilot-signup-confirm-password"
                                type="password"
                                value={state.confirmPassword}
                                onChange={(event) => updateField("confirmPassword", event.target.value)}
                                autoComplete="new-password"
                                placeholder="Repeat password"
                            />
                            {errors.confirmPassword ? (
                                <p className="text-sm text-red-600">{errors.confirmPassword}</p>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pilot-signup-handle">Handle</Label>
                            <Input
                                id="pilot-signup-handle"
                                value={state.handle}
                                onChange={(event) => {
                                    setHasEditedHandle(true);
                                    updateField("handle", sanitizeHandle(event.target.value));
                                }}
                                autoComplete="nickname"
                                placeholder="your-handle"
                            />
                            <p className="text-sm text-[#6b5f52]">
                                This defaults from your first and last name. You can still edit it before creating your account.
                            </p>
                            {errors.handle ? <p className="text-sm text-red-600">{errors.handle}</p> : null}
                        </div>

                        <altcha-widget ref={altchaRef} challenge="/api/altcha/challenge" />

                        <Button type="submit" disabled={isSubmitting || !altchaPayload} className="w-full bg-[#e8720c] text-[#181512] hover:bg-[#ff8c2a]">
                            {isSubmitting ? "Creating account..." : "Create account"}
                        </Button>

                        <p className="text-center text-sm text-[#6b5f52]">
                            Already have an account?{" "}
                            <Link href="/login" className="underline hover:text-[#181512]">
                                Log in
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAtom } from "jotai";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { submitSignupFormAction } from "@/components/forms/signup/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

type PilotSignupState = {
    email: string;
    password: string;
    confirmPassword: string;
    handle: string;
};

type PilotSignupErrors = Partial<Record<keyof PilotSignupState, string>>;

const initialState: PilotSignupState = {
    email: "",
    password: "",
    confirmPassword: "",
    handle: "",
};

function sanitizeHandle(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
}

function getErrors(state: PilotSignupState): PilotSignupErrors {
    const errors: PilotSignupErrors = {};

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

export function PilotSignupForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [, setAuthInfo] = useAtom(authInfoAtom);
    const [state, setState] = useState<PilotSignupState>(initialState);
    const [errors, setErrors] = useState<PilotSignupErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const updateField = (field: keyof PilotSignupState, value: string) => {
        setState((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const nextErrors = getErrors(state);
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await submitSignupFormAction({
                handle: sanitizeHandle(state.handle),
                _email: state.email.trim(),
                _password: state.password,
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
                description: "Now verify your email. You can complete your profile and request Kamooni verification later.",
            });

            const nextParams = new URLSearchParams();
            nextParams.set("email", state.email.trim());
            nextParams.set("handle", result.data.user.handle || sanitizeHandle(state.handle));
            if (process.env.NODE_ENV !== "production" && result.data.devVerificationToken) {
                nextParams.set("devVerificationToken", result.data.devVerificationToken);
            }
            const redirectTo = searchParams?.get("redirectTo");
            if (redirectTo) {
                nextParams.set("redirectTo", redirectTo);
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
        <div className="flex min-h-screen items-center justify-center bg-[#f7fbff] px-4 py-10">
            <Card className="w-full max-w-md border-[#d8e7f3] shadow-sm">
                <CardHeader className="space-y-2">
                    <CardTitle className="text-2xl">Pilot quick signup</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Start with the essentials. You can add a profile picture and About text later.
                    </p>
                </CardHeader>
                <CardContent>
                    <form className="space-y-5" onSubmit={onSubmit}>
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
                                onChange={(event) => updateField("handle", sanitizeHandle(event.target.value))}
                                autoComplete="nickname"
                                placeholder="your-handle"
                            />
                            <p className="text-sm text-muted-foreground">
                                This is the handle others will use to find you on Kamooni.
                            </p>
                            {errors.handle ? <p className="text-sm text-red-600">{errors.handle}</p> : null}
                        </div>

                        <Button type="submit" disabled={isSubmitting} className="w-full">
                            {isSubmitting ? "Creating account..." : "Create account"}
                        </Button>

                        <p className="text-center text-sm text-muted-foreground">
                            Already have an account?{" "}
                            <Link href="/login" className="underline hover:text-foreground">
                                Log in
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

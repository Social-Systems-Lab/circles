"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { completePendingRegistrationAction } from "@/components/forms/signup/pending-actions";
import { SignupBrand } from "@/components/forms/signup/signup-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PreviewState = "default" | "error" | "loading";

export function PasswordCreationCard({
    authorizationAvailable = true,
    preview = false,
    previewState = "default",
}: {
    authorizationAvailable?: boolean;
    preview?: boolean;
    previewState?: PreviewState;
}) {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [showSupportLink, setShowSupportLink] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});

    const previewBusy = preview && previewState === "loading";

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (preview) {
            setMessage("Preview only — no account was created and no password was sent.");
            return;
        }
        const nextErrors: typeof errors = {};
        if (password.length < 8 || password.length > 128) {
            nextErrors.password = "Use between 8 and 128 characters.";
        }
        if (!confirmation) {
            nextErrors.confirmation = "Enter your password again to confirm it.";
        } else if (password !== confirmation) {
            nextErrors.confirmation = "These passwords don’t match.";
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setBusy(true);
        setMessage("");
        try {
            const result = await completePendingRegistrationAction(password);
            if (!result.success) {
                setShowSupportLink("code" in result && result.code !== "invalid_password");
                setMessage(result.message || "We couldn’t complete signup. Please try again or contact support.");
                return;
            }
            setPassword("");
            setConfirmation("");
            setSuccess(true);
            setMessage("Your account is ready. Taking you to Kamooni…");
            router.replace(result.redirectTo || "/explore");
            router.refresh();
        } catch {
            setShowSupportLink(true);
            setMessage(
                "We couldn’t safely finish setting up your account. If you may have completed signup, try signing in. Otherwise contact support for help.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-3 sm:p-6">
            <Card className="w-full max-w-md rounded-2xl">
                <CardHeader className="space-y-3">
                    <SignupBrand />
                    <CardTitle className="text-2xl">Create your password</CardTitle>
                    <CardDescription>
                        Your email is verified. Choose a password and your account will be ready.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {preview && (
                        <p className="mb-4 rounded-lg bg-muted p-3 text-sm" role="status">
                            Development preview · password submission is disabled.
                        </p>
                    )}
                    {!preview && !authorizationAvailable ? (
                        <div className="space-y-4">
                            <p role="alert" className="rounded-lg bg-muted p-4 text-sm">
                                This secure password setup step has expired or was already used. If your account is
                                ready, sign in. Otherwise contact support for help continuing signup.
                            </p>
                            <div className="flex flex-col gap-3">
                                <Button asChild className="min-h-12 w-full">
                                    <Link href="/signup/recover">Email me a fresh verification link</Link>
                                </Button>
                                <Link className="text-center text-sm underline" href="/login">
                                    Sign in
                                </Link>
                                <Link
                                    className="text-center text-sm underline"
                                    href="mailto:hello@socialsystems.io?subject=Kamooni%20signup%20help"
                                >
                                    Contact support
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={submit} noValidate className="space-y-5">
                            <p id="password-requirements" className="text-sm text-muted-foreground">
                                Your password must be 8–128 characters long.
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="signup-password">Password</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="signup-password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        aria-invalid={Boolean(errors.password)}
                                        aria-describedby={
                                            errors.password ? "signup-password-error" : "password-requirements"
                                        }
                                        className="min-h-12"
                                        maxLength={128}
                                        disabled={!preview && !authorizationAvailable}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        aria-pressed={showPassword}
                                        onClick={() => setShowPassword((shown) => !shown)}
                                        className="min-h-12 min-w-12 px-3"
                                    >
                                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                                    </Button>
                                </div>
                                {errors.password && (
                                    <p id="signup-password-error" role="alert" className="text-sm text-destructive">
                                        {errors.password}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="signup-password-confirm">Confirm password</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="signup-password-confirm"
                                        name="confirmPassword"
                                        type={showConfirmation ? "text" : "password"}
                                        autoComplete="new-password"
                                        value={confirmation}
                                        onChange={(event) => setConfirmation(event.target.value)}
                                        aria-invalid={Boolean(errors.confirmation)}
                                        aria-describedby={errors.confirmation ? "signup-confirmation-error" : undefined}
                                        className="min-h-12"
                                        maxLength={128}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        aria-label={showConfirmation ? "Hide confirmation" : "Show confirmation"}
                                        aria-pressed={showConfirmation}
                                        onClick={() => setShowConfirmation((shown) => !shown)}
                                        className="min-h-12 min-w-12 px-3"
                                    >
                                        {showConfirmation ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                                    </Button>
                                </div>
                                {errors.confirmation && (
                                    <p id="signup-confirmation-error" role="alert" className="text-sm text-destructive">
                                        {errors.confirmation}
                                    </p>
                                )}
                            </div>
                            {message && (
                                <div>
                                    <p role={success ? "status" : "alert"} className="text-sm text-muted-foreground">
                                        {message}
                                    </p>
                                    {showSupportLink && (
                                        <div className="mt-2 flex gap-4 text-sm">
                                            <Link className="underline" href="/login">
                                                Sign in
                                            </Link>
                                            <Link
                                                className="underline"
                                                href="mailto:hello@socialsystems.io?subject=Kamooni%20signup%20help"
                                            >
                                                Contact support
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}
                            {preview && previewState === "error" && !message && (
                                <p role="alert" className="text-sm text-destructive">
                                    We couldn’t complete signup. Please review the password and try again.
                                </p>
                            )}
                            <Button type="submit" disabled={busy || previewBusy || success} className="min-h-12 w-full">
                                {busy || previewBusy ? "Completing…" : success ? "Signup complete" : "Complete signup"}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}

"use client";

import { Suspense, useState } from "react";
import { CheckEmailCard } from "@/components/forms/signup/check-email-card";
import { PasswordCreationCard } from "@/components/forms/signup/password-creation-card";
import { PendingSignupForm } from "@/components/forms/signup/pending-signup-form";

type Screen = "signup" | "check-email" | "password";
type PreviewState = "default" | "error" | "loading";

export default function OnboardingPreview() {
    const [screen, setScreen] = useState<Screen>("signup");
    const [previewState, setPreviewState] = useState<PreviewState>("default");

    return (
        <div className="min-h-screen bg-background">
            <header className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Onboarding card preview</h1>
                    <p className="text-sm text-muted-foreground">Development only · all actions are simulated.</p>
                </div>
                <div className="flex flex-wrap gap-2" aria-label="Preview controls">
                    <button
                        type="button"
                        aria-pressed={screen === "signup"}
                        onClick={() => setScreen("signup")}
                        className="min-h-11 rounded-md border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Signup card
                    </button>
                    <button
                        type="button"
                        aria-pressed={screen === "check-email"}
                        onClick={() => setScreen("check-email")}
                        className="min-h-11 rounded-md border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Check-email card
                    </button>
                    <button
                        type="button"
                        aria-pressed={screen === "password"}
                        onClick={() => setScreen("password")}
                        className="min-h-11 rounded-md border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Password card
                    </button>
                    <label className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm">
                        State
                        <select
                            aria-label="Preview state"
                            value={previewState}
                            onChange={(event) => setPreviewState(event.target.value as PreviewState)}
                            className="min-h-9 rounded border bg-background px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="default">Default</option>
                            <option value="error">Error</option>
                            <option value="loading">Loading</option>
                        </select>
                    </label>
                </div>
            </header>
            <Suspense fallback={<p className="p-6 text-center text-sm">Loading preview…</p>}>
                {screen === "signup" ? (
                    <PendingSignupForm preview previewState={previewState} />
                ) : screen === "check-email" ? (
                    <CheckEmailCard preview sampleEmail="alex@example.org" previewState={previewState} />
                ) : (
                    <PasswordCreationCard preview previewState={previewState} />
                )}
            </Suspense>
        </div>
    );
}

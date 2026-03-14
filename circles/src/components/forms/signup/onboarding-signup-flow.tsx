"use client";

import Image from "next/image";
import Link from "next/link";
import { Montserrat, Noto_Serif } from "next/font/google";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAtom } from "jotai";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { submitSignupFormAction } from "@/components/forms/signup/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const montserrat = Montserrat({
    subsets: ["latin"],
    variable: "--font-montserrat",
});

const notoSerif = Noto_Serif({
    subsets: ["latin"],
    variable: "--font-noto-serif",
});

const ONBOARDING_FLOW = "v2-signup";

const stepTitles = ["Welcome", "Account", "Handle", "Skills"] as const;

const skillOptions = [
    { label: "Design", value: "design" },
    { label: "Development", value: "development" },
    { label: "Writing", value: "writing" },
    { label: "Community organizing", value: "community-organizing" },
    { label: "Research", value: "research" },
    { label: "Fundraising", value: "fundraising" },
    { label: "Marketing", value: "marketing" },
    { label: "Translation", value: "translation" },
    { label: "Project coordination", value: "project-coordination" },
    { label: "Teaching", value: "teaching" },
    { label: "Facilitation", value: "facilitation" },
    { label: "Operations", value: "operations" },
    { label: "Media / storytelling", value: "media-storytelling" },
    { label: "Product / strategy", value: "product-strategy" },
] as const;

type SignupState = {
    email: string;
    password: string;
    handle: string;
    skills: string[];
};

type SignupErrors = Partial<Record<"email" | "password" | "handle" | "skills", string>>;

const initialState: SignupState = {
    email: "",
    password: "",
    handle: "",
    skills: [],
};

function sanitizeHandle(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
}

function deriveName(handle: string, email: string) {
    const fallback = email.split("@")[0] || "kamooni-user";
    return sanitizeHandle(handle || fallback)
        .split("-")
        .filter(Boolean)
        .join(" ");
}

function getAccountErrors(state: SignupState): SignupErrors {
    const errors: SignupErrors = {};

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

    return errors;
}

function getHandleErrors(state: SignupState): SignupErrors {
    const errors: SignupErrors = {};
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

export function OnboardingSignupFlow() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [, setAuthInfo] = useAtom(authInfoAtom);
    const [stepIndex, setStepIndex] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [state, setState] = useState<SignupState>(initialState);
    const [errors, setErrors] = useState<SignupErrors>({});

    const currentStep = stepTitles[stepIndex];

    const updateField = (field: keyof SignupState, value: string | string[]) => {
        setState((prev) => ({
            ...prev,
            [field]: value,
        }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const toggleSkill = (value: string) => {
        updateField(
            "skills",
            state.skills.includes(value) ? state.skills.filter((skill) => skill !== value) : [...state.skills, value],
        );
    };

    const goToNextStep = () => {
        if (stepIndex === 1) {
            const nextErrors = getAccountErrors(state);
            if (Object.keys(nextErrors).length > 0) {
                setErrors(nextErrors);
                return;
            }
        }

        if (stepIndex === 2) {
            const nextErrors = getHandleErrors(state);
            if (Object.keys(nextErrors).length > 0) {
                setErrors(nextErrors);
                return;
            }
            updateField("handle", sanitizeHandle(state.handle));
        }

        setStepIndex((prev) => Math.min(prev + 1, stepTitles.length - 1));
    };

    const goToPreviousStep = () => {
        setErrors({});
        setStepIndex((prev) => Math.max(prev - 1, 0));
    };

    const submitSignup = async () => {
        if (state.skills.length < 1) {
            setErrors({ skills: "Choose at least one skill." });
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await submitSignupFormAction({
                name: deriveName(state.handle, state.email),
                handle: sanitizeHandle(state.handle),
                type: "user",
                _email: state.email.trim(),
                _password: state.password,
                skills: state.skills,
                metadata: {
                    onboardingFlow: ONBOARDING_FLOW,
                },
            });

            if (!result.success) {
                const message = result.message || "An error occurred during signup.";

                if (message.toLowerCase().includes("handle")) {
                    setStepIndex(2);
                    setErrors({ handle: message });
                } else if (message.toLowerCase().includes("email")) {
                    setStepIndex(1);
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
                description: "Welcome to Kamooni.",
            });

            const redirectUrl = searchParams?.get("redirectTo") ?? `/circles/${result.data.user.handle}`;
            router.push(redirectUrl);
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
        <div
            className={cn(
                "relative min-h-screen overflow-hidden bg-kam-hero-yellow text-kam-gray-dark",
                montserrat.variable,
                notoSerif.variable,
            )}
        >
            <div className="pointer-events-none absolute -left-[110px] -top-[90px] h-[320px] w-[320px] rotate-12 opacity-40 sm:h-[420px] sm:w-[420px]">
                <Image src="/images/flower-bg.png" alt="" fill className="object-contain" />
            </div>
            <div className="pointer-events-none absolute -bottom-[100px] -right-[100px] h-[320px] w-[320px] -rotate-12 opacity-40 sm:h-[420px] sm:w-[420px]">
                <Image src="/images/flower-bg.png" alt="" fill className="object-contain" />
            </div>

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
                <Link href="/welcome" className="mb-6 flex items-center gap-3 self-start">
                    <Image
                        src="/images/logo-test3.jpg"
                        alt="Kamooni"
                        width={48}
                        height={48}
                        className="h-10 w-10 rounded-full object-cover shadow-md"
                    />
                    <div>
                        <div className="text-lg font-semibold">Kamooni</div>
                        <div className="text-xs uppercase tracking-[0.24em] text-kam-gray-dark/60">
                            Find the others
                        </div>
                    </div>
                </Link>

                <Card className="overflow-hidden border-0 bg-white/95 shadow-[0_30px_80px_rgba(122,70,19,0.22)]">
                    <div className="grid min-h-[720px] lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="relative flex flex-col justify-between bg-[linear-gradient(160deg,#f5c13a_0%,#f0a62c_48%,#ea8a22_100%)] p-8 text-white sm:p-10 lg:p-12">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.22),transparent_34%)]" />
                            <div className="relative">
                                <Image
                                    src="/images/logo-white.png"
                                    alt="Kamooni"
                                    width={180}
                                    height={172}
                                    className="mb-8 h-24 w-auto sm:h-28"
                                />
                                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-white/80">
                                    New onboarding
                                </p>
                                <h1 className="max-w-md font-[family-name:var(--font-noto-serif)] text-4xl leading-tight sm:text-5xl">
                                    Find the others.
                                </h1>
                                <p className="mt-5 max-w-md text-base leading-7 text-white/88 sm:text-lg">
                                    Join people building communities, projects, and practical alternatives together.
                                </p>
                            </div>

                            <div className="relative mt-10">
                                <div className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-white/75">
                                    Step {stepIndex + 1} of {stepTitles.length}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {stepTitles.map((title, index) => (
                                        <div
                                            key={title}
                                            className={cn(
                                                "rounded-full border px-3 py-1 text-sm",
                                                index === stepIndex
                                                    ? "border-white bg-white text-kam-button-red-orange"
                                                    : "border-white/35 bg-white/10 text-white/80",
                                            )}
                                        >
                                            {title}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <CardContent className="flex items-center p-0">
                            <div className="w-full px-6 py-8 sm:px-10 sm:py-10">
                                <div className="mb-8">
                                    <div className="text-sm font-semibold uppercase tracking-[0.24em] text-kam-button-red-orange/80">
                                        {currentStep}
                                    </div>
                                    <h2 className="mt-3 text-3xl font-semibold text-kam-gray-dark">
                                        {stepIndex === 0 && "Create your account"}
                                        {stepIndex === 1 && "Start with the essentials"}
                                        {stepIndex === 2 && "Choose your handle"}
                                        {stepIndex === 3 && "How would you like to contribute?"}
                                    </h2>
                                    <p className="mt-3 max-w-xl text-sm leading-6 text-kam-gray-dark/70 sm:text-base">
                                        {stepIndex === 0 &&
                                            "A lightweight start. Just enough to join the network and begin contributing."}
                                        {stepIndex === 1 && "Only email and password for now."}
                                        {stepIndex === 2 &&
                                            "This is how people will find you on Kamooni."}
                                        {stepIndex === 3 &&
                                            "Pick one or more areas where you want to help."}
                                    </p>
                                </div>

                                {stepIndex === 0 && (
                                    <div className="flex min-h-[340px] flex-col justify-between">
                                        <div className="space-y-4">
                                            <p className="text-base leading-7 text-kam-gray-dark/80">
                                                Kamooni helps people discover communities, contribute skills, collaborate
                                                on projects, and build trust through action.
                                            </p>
                                        </div>

                                        <div className="space-y-4">
                                            <Button
                                                type="button"
                                                onClick={goToNextStep}
                                                className="h-12 w-full bg-kam-button-red-orange text-base text-white hover:bg-kam-button-red-orange/90"
                                            >
                                                Create your account
                                            </Button>
                                            <p className="text-center text-sm text-kam-gray-dark/70">
                                                Already have an account?{" "}
                                                <Link href="/login" className="font-medium text-kam-button-red-orange hover:underline">
                                                    Log in
                                                </Link>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {stepIndex === 1 && (
                                    <form
                                        className="space-y-5"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            goToNextStep();
                                        }}
                                    >
                                        <div className="space-y-2">
                                            <Label htmlFor="signup-email">Email</Label>
                                            <Input
                                                id="signup-email"
                                                type="email"
                                                value={state.email}
                                                onChange={(event) => updateField("email", event.target.value)}
                                                autoComplete="email"
                                                placeholder="you@example.com"
                                                className="h-12"
                                            />
                                            {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="signup-password">Password</Label>
                                            <Input
                                                id="signup-password"
                                                type="password"
                                                value={state.password}
                                                onChange={(event) => updateField("password", event.target.value)}
                                                autoComplete="new-password"
                                                placeholder="At least 8 characters"
                                                className="h-12"
                                            />
                                            {errors.password && (
                                                <p className="text-sm text-red-600">{errors.password}</p>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                                            <Button type="button" variant="outline" onClick={goToPreviousStep} className="h-12 flex-1">
                                                Back
                                            </Button>
                                            <Button
                                                type="submit"
                                                className="h-12 flex-1 bg-kam-button-red-orange text-white hover:bg-kam-button-red-orange/90"
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {stepIndex === 2 && (
                                    <form
                                        className="space-y-5"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            goToNextStep();
                                        }}
                                    >
                                        <div className="space-y-2">
                                            <Label htmlFor="signup-handle">Handle</Label>
                                            <Input
                                                id="signup-handle"
                                                value={state.handle}
                                                onChange={(event) => updateField("handle", sanitizeHandle(event.target.value))}
                                                autoComplete="nickname"
                                                placeholder="your-handle"
                                                className="h-12"
                                            />
                                            <p className="text-sm text-kam-gray-dark/60">
                                                Lowercase letters, numbers, and hyphens only.
                                            </p>
                                            {errors.handle && <p className="text-sm text-red-600">{errors.handle}</p>}
                                        </div>

                                        <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                                            <Button type="button" variant="outline" onClick={goToPreviousStep} className="h-12 flex-1">
                                                Back
                                            </Button>
                                            <Button
                                                type="submit"
                                                className="h-12 flex-1 bg-kam-button-red-orange text-white hover:bg-kam-button-red-orange/90"
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {stepIndex === 3 && (
                                    <div className="space-y-6">
                                        <div className="flex flex-wrap gap-3">
                                            {skillOptions.map((skill) => {
                                                const selected = state.skills.includes(skill.value);
                                                return (
                                                    <button
                                                        key={skill.value}
                                                        type="button"
                                                        onClick={() => toggleSkill(skill.value)}
                                                        className={cn(
                                                            "rounded-full border px-4 py-2 text-left text-sm font-medium transition-colors",
                                                            selected
                                                                ? "border-kam-button-red-orange bg-kam-button-red-orange text-white"
                                                                : "border-kam-button-red-orange/20 bg-[#fff7ea] text-kam-gray-dark hover:border-kam-button-red-orange/60",
                                                        )}
                                                    >
                                                        {skill.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {errors.skills && <p className="text-sm text-red-600">{errors.skills}</p>}

                                        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                            <Button type="button" variant="outline" onClick={goToPreviousStep} className="h-12 flex-1">
                                                Back
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={submitSignup}
                                                disabled={isSubmitting}
                                                className="h-12 flex-1 bg-kam-button-red-orange text-white hover:bg-kam-button-red-orange/90"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Creating account...
                                                    </>
                                                ) : (
                                                    "Join Kamooni"
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </div>
                </Card>
            </div>
        </div>
    );
}

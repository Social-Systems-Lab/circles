"use client";

import Image from "next/image";
import Link from "next/link";
import { Montserrat, Noto_Serif } from "next/font/google";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2 } from "lucide-react";
import { useAtom } from "jotai";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { submitSignupFormAction } from "@/components/forms/signup/actions";
import {
    saveInterestsAction,
    saveMissionAction,
    saveProfileAction,
    saveSkillsAction,
} from "@/components/onboarding/actions";
import { ImageItem, MultiImageUploader } from "@/components/forms/controls/multi-image-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
const INITIAL_VISIBLE_OPTIONS = 12;
const MIN_SELECTION_COUNT = 2;
const SHORT_BIO_MAX_LENGTH = 200;
const SKILLS_PROMPT_TEXT =
  "Choose a few skill areas you could help others with";
const SKILLS_HELPER_TEXT =
  "Choose at least 2. You can change or add more later.";
const INTERESTS_PROMPT_TEXT =
  "Pick a few topics you care about so Kamooni can connect you with relevant projects, events, and communities.";
const INTERESTS_HELPER_TEXT =
  "Choose at least 2. You can change or add more later.";
const stepTitles = ["Welcome", "Account", "Skills", "Interests", "Profile"] as const;

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
    { label: "Partnerships", value: "partnerships" },
    { label: "Event organizing", value: "event-organizing" },
    { label: "Mentoring", value: "mentoring" },
    { label: "Coaching", value: "coaching" },
    { label: "Data / analysis", value: "data-analysis" },
    { label: "Audio / video", value: "audio-video" },
    { label: "Legal / compliance", value: "legal-compliance" },
    { label: "Finance / budgeting", value: "finance-budgeting" },
] as const;

const interestOptions = [
    { label: "Climate", value: "climate" },
    { label: "Community building", value: "community-building" },
    { label: "Democracy", value: "democracy" },
    { label: "Education", value: "education" },
    { label: "Health", value: "health" },
    { label: "Local economy", value: "local-economy" },
    { label: "Open source", value: "open-source" },
    { label: "Mutual aid", value: "mutual-aid" },
    { label: "Housing", value: "housing" },
    { label: "Food systems", value: "food-systems" },
    { label: "Governance", value: "governance" },
    { label: "Arts / culture", value: "arts-culture" },
    { label: "Regenerative living", value: "regenerative-living" },
    { label: "Civic tech", value: "civic-tech" },
    { label: "Youth", value: "youth" },
    { label: "Elder care", value: "elder-care" },
    { label: "Cooperative business", value: "cooperative-business" },
    { label: "Social innovation", value: "social-innovation" },
] as const;

type SignupState = {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    handle: string;
    skills: string[];
    interests: string[];
    about: string;
    mission: string;
};

type SignupErrors = Partial<Record<keyof SignupState, string>>;

const initialState: SignupState = {
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    handle: "",
    skills: [],
    interests: [],
    about: "",
    mission: "",
};

function sanitizeHandle(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
}

function getAccountErrors(state: SignupState): SignupErrors {
    const errors: SignupErrors = {};

    if (!state.name.trim()) {
        errors.name = "Name is required.";
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

    if (!state.confirmPassword) {
        errors.confirmPassword = "Please repeat your password.";
    } else if (state.password !== state.confirmPassword) {
        errors.confirmPassword = "Passwords do not match.";
    }

    return errors;
}

type MultiSelectField = "skills" | "interests";

function BrandHeader({ compact }: { compact: boolean }) {
    return (
        <div
            className={cn(
                "mb-8 overflow-hidden rounded-[28px] border border-white/70 shadow-[0_10px_35px_rgba(123,81,24,0.08)]",
                compact ? "bg-[#fff4d5]/88" : "bg-[#f3cc57]/92",
            )}
        >
            <div
                className={cn(
                    "relative flex items-center gap-4",
                    compact ? "px-4 py-4 sm:px-5" : "px-6 py-6 sm:px-8 sm:py-7",
                )}
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_45%)]" />
                <div
                    className={cn(
                        "relative shrink-0 rounded-full border border-white/70 bg-[#fff8e7] shadow-sm",
                        compact ? "h-12 w-12 p-2.5" : "h-16 w-16 p-3 sm:h-20 sm:w-20 sm:p-4",
                    )}
                >
                    <Image src="/images/kamooni_logo.png" alt="Kamooni logo" fill className="object-contain p-2" />
                </div>
                <div className="relative">
                    <div
                        className={cn(
                            "font-[family-name:var(--font-noto-serif)] leading-none text-kam-gray-dark",
                            compact ? "text-2xl sm:text-[2rem]" : "text-[2.1rem] sm:text-[2.7rem]",
                        )}
                    >
                        Kamooni
                    </div>
                    <div
                        className={cn(
                            "mt-1 text-kam-gray-dark/72",
                            compact ? "text-sm" : "text-base sm:text-lg",
                        )}
                    >
                        Find the others.
                    </div>
                </div>
            </div>
        </div>
    );
}

export function OnboardingSignupFlow() {
    const router = useRouter();
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [, setAuthInfo] = useAtom(authInfoAtom);
    const [stepIndex, setStepIndex] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [state, setState] = useState<SignupState>(initialState);
    const [errors, setErrors] = useState<SignupErrors>({});
    const [createdUserId, setCreatedUserId] = useState<string | null>(null);
    const [createdUserHandle, setCreatedUserHandle] = useState<string | null>(null);
    const [profilePictureFile, setProfilePictureFile] = useState<File | undefined>(undefined);
    const [profilePicturePreview, setProfilePicturePreview] = useState("/images/default-user-picture.png");
    const [heroImages, setHeroImages] = useState<ImageItem[]>([]);
    const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
    const [isInterestsExpanded, setIsInterestsExpanded] = useState(false);
    const [completionRedirectUrl, setCompletionRedirectUrl] = useState<string | null>(null);

    const visibleSkillOptions = isSkillsExpanded ? skillOptions : skillOptions.slice(0, INITIAL_VISIBLE_OPTIONS);
    const visibleInterestOptions = isInterestsExpanded
        ? interestOptions
        : interestOptions.slice(0, INITIAL_VISIBLE_OPTIONS);
    const hasMinimumSkills = state.skills.length >= MIN_SELECTION_COUNT;
    const hasMinimumInterests = state.interests.length >= MIN_SELECTION_COUNT;
    const hasProfilePicture = Boolean(profilePictureFile);
    const hasAbout = Boolean(state.about.trim());
    const canCompleteProfileSetup = hasProfilePicture && hasAbout;

    const updateField = (field: keyof SignupState, value: string | string[]) => {
        setState((prev) => ({
            ...prev,
            [field]: value,
        }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const toggleSelection = (field: MultiSelectField, value: string) => {
        updateField(
            field,
            state[field].includes(value)
                ? state[field].filter((item) => item !== value)
                : [...state[field], value],
        );
    };

    useEffect(() => {
        return () => {
            if (profilePicturePreview.startsWith("blob:")) {
                URL.revokeObjectURL(profilePicturePreview);
            }
        };
    }, [profilePicturePreview]);

    useEffect(() => {
        if (!completionRedirectUrl) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            router.push(completionRedirectUrl);
        }, 1400);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [completionRedirectUrl, router]);

    const handleProfilePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (profilePicturePreview.startsWith("blob:")) {
            URL.revokeObjectURL(profilePicturePreview);
        }

        setProfilePictureFile(file);
        setProfilePicturePreview(URL.createObjectURL(file));
    };

    const goToNextStep = () => {
        if (stepIndex === 1) {
            const nextErrors = getAccountErrors(state);
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

    const continueToInterests = () => {
        if (!hasMinimumSkills) {
            setErrors({ skills: SKILLS_HELPER_TEXT });
            return;
        }

        setErrors((prev) => ({ ...prev, skills: undefined }));
        setStepIndex(3);
    };

    const submitSignup = async () => {
        if (!hasMinimumSkills) {
            setErrors({ skills: SKILLS_HELPER_TEXT });
            setStepIndex(2);
            return;
        }

        if (!hasMinimumInterests) {
            setErrors({ interests: INTERESTS_HELPER_TEXT });
            setStepIndex(3);
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await submitSignupFormAction({
                name: state.name.trim(),
                handle: sanitizeHandle(state.handle),
                type: "user",
                _email: state.email.trim(),
                _password: state.password,
                skills: state.skills,
                interests: state.interests,
                metadata: {
                    onboardingFlow: ONBOARDING_FLOW,
                },
            });

            if (!result.success) {
                const message = result.message || "An error occurred during signup.";

                if (message.toLowerCase().includes("handle")) {
                    setStepIndex(1);
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
            setCreatedUserId(String(result.data.user._id || ""));
            setCreatedUserHandle(result.data.user.handle || sanitizeHandle(state.handle));

            toast({
                title: "Account created",
                description: "Now finish your profile so your page feels like yours.",
            });

            setStepIndex(4);
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

    const continueFromInterests = async () => {
        if (!hasMinimumSkills) {
            setErrors({ skills: SKILLS_HELPER_TEXT });
            setStepIndex(2);
            return;
        }

        if (!hasMinimumInterests) {
            setErrors({ interests: INTERESTS_HELPER_TEXT });
            return;
        }

        if (!createdUserId) {
            await submitSignup();
            return;
        }

        setIsSubmitting(true);

        try {
            const skillsResult = await saveSkillsAction(state.skills, createdUserId);
            if (!skillsResult.success) {
                toast({
                    title: "Could not save your skills",
                    description: skillsResult.message,
                    variant: "destructive",
                });
                return;
            }

            const interestsResult = await saveInterestsAction(state.interests, createdUserId);
            if (!interestsResult.success) {
                toast({
                    title: "Could not save your interests",
                    description: interestsResult.message,
                    variant: "destructive",
                });
                return;
            }

            setUser((prev) =>
                prev
                    ? {
                          ...prev,
                          skills: state.skills,
                          interests: state.interests,
                          offers: {
                              ...(prev.offers || {}),
                              skills: state.skills,
                              visibility: prev.offers?.visibility || "public",
                          },
                      }
                    : prev,
            );

            setStepIndex(4);
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

    const completeProfileSetup = async () => {
        if (!createdUserId || !createdUserHandle) {
            return;
        }

        if (!profilePictureFile) {
            toast({
                title: "Profile image required",
                description: "Upload a profile image before finishing onboarding.",
                variant: "destructive",
            });
            return;
        }

        const trimmedAbout = state.about.trim();
        if (!trimmedAbout) {
            setErrors({ about: "Tell people a little about yourself before continuing." });
            return;
        }

        if (trimmedAbout.length > SHORT_BIO_MAX_LENGTH) {
            setErrors({ about: `Keep your short description to ${SHORT_BIO_MAX_LENGTH} characters or fewer.` });
            return;
        }

        setIsSubmitting(true);

        try {
            const trimmedMission = state.mission.trim();
            const profileResult = await saveProfileAction(
                trimmedAbout,
                "",
                createdUserId,
                profilePictureFile,
                heroImages,
            );
            if (!profileResult.success) {
                toast({
                    title: "Could not finish profile setup",
                    description: profileResult.message,
                    variant: "destructive",
                });
                return;
            }

            if (trimmedMission) {
                const missionResult = await saveMissionAction(trimmedMission, createdUserId);
                if (!missionResult.success) {
                    toast({
                        title: "Could not save your mission",
                        description: missionResult.message,
                        variant: "destructive",
                    });
                    return;
                }
            }

            setUser((prev) =>
                prev
                    ? {
                          ...prev,
                          description: trimmedAbout,
                          mission: trimmedMission || prev.mission,
                          interests: state.interests,
                          skills: state.skills,
                          offers: {
                              ...(prev.offers || {}),
                              skills: state.skills,
                              visibility: prev.offers?.visibility || "public",
                          },
                          picture: profilePictureFile
                              ? {
                                    ...(prev.picture || {}),
                                    url: profilePicturePreview,
                                }
                              : prev.picture,
                      }
                    : prev,
            );

            setCompletionRedirectUrl(`/circles/${createdUserHandle}/home`);
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
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_52%)]" />
            <div className="pointer-events-none absolute -left-[110px] -top-[90px] h-[320px] w-[320px] rotate-12 opacity-25 sm:h-[420px] sm:w-[420px]">
                <Image src="/images/flower-bg.png" alt="" fill className="object-contain" />
            </div>
            <div className="pointer-events-none absolute -bottom-[100px] -right-[100px] h-[320px] w-[320px] -rotate-12 opacity-25 sm:h-[420px] sm:w-[420px]">
                <Image src="/images/flower-bg.png" alt="" fill className="object-contain" />
            </div>

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
                <Card className="overflow-hidden border border-white/60 bg-[#fffaf2]/95 shadow-[0_22px_60px_rgba(123,81,24,0.14)]">
                    <CardContent className="relative p-6 sm:p-8 md:p-10">
                        <div className="mx-auto max-w-2xl">
                            <BrandHeader compact={stepIndex !== 0} />

                            <div className="mb-8">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9d5a21]/80">
                                        Step {stepIndex + 1} of {stepTitles.length}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {stepTitles.map((title, index) => (
                                            <div
                                                key={title}
                                                className={cn(
                                                    "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]",
                                                    index === stepIndex
                                                        ? "border-[#c77733]/40 bg-white text-[#9d5a21]"
                                                        : "border-[#d9bb79]/60 bg-[#fff4d7]/70 text-kam-gray-dark/55",
                                                )}
                                            >
                                                {title}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edd9a6]">
                                    <div
                                        className="h-full rounded-full bg-[#c77733] transition-all"
                                        style={{ width: `${((stepIndex + 1) / stepTitles.length) * 100}%` }}
                                    />
                                </div>
                                <div className="mt-6">
                                    <h1 className="font-[family-name:var(--font-noto-serif)] text-3xl leading-tight text-kam-gray-dark sm:text-4xl">
                                        {stepIndex === 0 && "Find the others"}
                                        {stepIndex === 1 && "Create your account"}
                                        {stepIndex === 2 && "How you can contribute"}
                                        {stepIndex === 3 && "What you care about"}
                                        {stepIndex === 4 && "Set up your profile"}
                                    </h1>
                                    <p className="mt-3 max-w-2xl text-sm leading-6 text-kam-gray-dark/72 sm:text-base">
                                        {stepIndex === 0 &&
                                            "Join people building communities, projects, and practical alternatives together."}
                                        {stepIndex === 1 &&
                                            "A simple start: your name, login details, and the handle others will use to find you on Kamooni."}
                                        {stepIndex === 2 && SKILLS_PROMPT_TEXT}
                                        {stepIndex === 3 && INTERESTS_PROMPT_TEXT}
                                        {stepIndex === 4 &&
                                            "Add a face, a cover image, a short introduction, and optionally a mission so your profile feels alive when you arrive."}
                                    </p>
                                </div>
                            </div>

                            {stepIndex === 0 && (
                                <div className="space-y-8">
                                    <div className="rounded-[24px] border border-white/70 bg-white/70 p-6 shadow-[0_10px_35px_rgba(123,81,24,0.08)]">
                                        <p className="text-base leading-7 text-kam-gray-dark/80">
                                            Kamooni helps people discover communities, contribute skills, collaborate on
                                            projects, and build trust through action.
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <Button
                                            type="button"
                                            onClick={goToNextStep}
                                            className="h-12 w-full bg-[#b65d2c] text-base text-white hover:bg-[#9f5227]"
                                        >
                                            Create your account
                                        </Button>
                                        <p className="text-center text-sm text-kam-gray-dark/70">
                                            Already have an account?{" "}
                                            <Link href="/login" className="font-medium text-[#9f5227] hover:underline">
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
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="signup-name">Name</Label>
                                            <Input
                                                id="signup-name"
                                                value={state.name}
                                                onChange={(event) => updateField("name", event.target.value)}
                                                autoComplete="name"
                                                placeholder="Your name"
                                                className="h-12 border-[#d9c7a0] bg-white/80"
                                            />
                                            {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
                                        </div>

                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="signup-email">Email</Label>
                                            <Input
                                                id="signup-email"
                                                type="email"
                                                value={state.email}
                                                onChange={(event) => updateField("email", event.target.value)}
                                                autoComplete="email"
                                                placeholder="you@example.com"
                                                className="h-12 border-[#d9c7a0] bg-white/80"
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
                                                className="h-12 border-[#d9c7a0] bg-white/80"
                                            />
                                            {errors.password && (
                                                <p className="text-sm text-red-600">{errors.password}</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="signup-confirm-password">Repeat password</Label>
                                            <Input
                                                id="signup-confirm-password"
                                                type="password"
                                                value={state.confirmPassword}
                                                onChange={(event) => updateField("confirmPassword", event.target.value)}
                                                autoComplete="new-password"
                                                placeholder="Repeat password"
                                                className="h-12 border-[#d9c7a0] bg-white/80"
                                            />
                                            {errors.confirmPassword && (
                                                <p className="text-sm text-red-600">{errors.confirmPassword}</p>
                                            )}
                                        </div>

                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="signup-handle">Handle</Label>
                                            <Input
                                                id="signup-handle"
                                                value={state.handle}
                                                onChange={(event) => updateField("handle", sanitizeHandle(event.target.value))}
                                                autoComplete="nickname"
                                                placeholder="your-handle"
                                                className="h-12 border-[#d9c7a0] bg-white/80"
                                            />
                                            <p className="text-sm text-kam-gray-dark/60">
                                                This is the handle others will use to find you on Kamooni.
                                            </p>
                                            {errors.handle && <p className="text-sm text-red-600">{errors.handle}</p>}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 pt-3 sm:flex-row">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={goToPreviousStep}
                                            className="h-12 flex-1 border-[#d7bf94] bg-white/80 text-kam-gray-dark"
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="h-12 flex-1 bg-[#b65d2c] text-white hover:bg-[#9f5227]"
                                        >
                                            Continue
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {stepIndex === 2 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm text-kam-gray-dark/62">
                                            {hasMinimumSkills ? SKILLS_PROMPT_TEXT : SKILLS_HELPER_TEXT}
                                        </p>
                                        <p className="text-sm font-medium text-[#9d5a21]">
                                            {state.skills.length} selected
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {visibleSkillOptions.map((skill) => {
                                            const selected = state.skills.includes(skill.value);
                                            return (
                                                <button
                                                    key={skill.value}
                                                    type="button"
                                                    onClick={() => toggleSelection("skills", skill.value)}
                                                    className={cn(
                                                        "min-h-[72px] rounded-[20px] border px-4 py-3 text-left text-sm font-medium transition-colors",
                                                        selected
                                                            ? "border-[#c77733] bg-[#c77733] text-white"
                                                            : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#c77733]/60",
                                                    )}
                                                >
                                                    {skill.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {skillOptions.length > INITIAL_VISIBLE_OPTIONS && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setIsSkillsExpanded((prev) => !prev)}
                                            className="px-0 text-[#9f5227] hover:bg-transparent hover:text-[#9f5227]"
                                        >
                                            {isSkillsExpanded ? "Show fewer skill areas" : "Show all skill areas"}
                                        </Button>
                                    )}

                                    {errors.skills ? (
                                        <p className="text-sm text-red-600">{errors.skills}</p>
                                    ) : (
                                        !hasMinimumSkills && (
                                            <p className="text-sm text-[#9f5227]">{SKILLS_HELPER_TEXT}</p>
                                        )
                                    )}

                                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={goToPreviousStep}
                                            className="h-12 flex-1 border-[#d7bf94] bg-white/80 text-kam-gray-dark"
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={continueToInterests}
                                            disabled={!hasMinimumSkills}
                                            className="h-12 flex-1 bg-[#b65d2c] text-white hover:bg-[#9f5227]"
                                        >
                                            Continue
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {stepIndex === 3 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm text-kam-gray-dark/62">
                                            {hasMinimumInterests ? INTERESTS_PROMPT_TEXT : INTERESTS_HELPER_TEXT}
                                        </p>
                                        <p className="text-sm font-medium text-[#9d5a21]">
                                            {state.interests.length} selected
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {visibleInterestOptions.map((interest) => {
                                            const selected = state.interests.includes(interest.value);
                                            return (
                                                <button
                                                    key={interest.value}
                                                    type="button"
                                                    onClick={() => toggleSelection("interests", interest.value)}
                                                    className={cn(
                                                        "min-h-[72px] rounded-[20px] border px-4 py-3 text-left text-sm font-medium transition-colors",
                                                        selected
                                                            ? "border-[#6f7a34] bg-[#6f7a34] text-white"
                                                            : "border-[#d8c7a0] bg-white/72 text-kam-gray-dark hover:border-[#6f7a34]/60",
                                                    )}
                                                >
                                                    {interest.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {interestOptions.length > INITIAL_VISIBLE_OPTIONS && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setIsInterestsExpanded((prev) => !prev)}
                                            className="px-0 text-[#6f7a34] hover:bg-transparent hover:text-[#6f7a34]"
                                        >
                                            {isInterestsExpanded ? "Show fewer interests" : "Show all interests"}
                                        </Button>
                                    )}

                                    {errors.interests ? (
                                        <p className="text-sm text-red-600">{errors.interests}</p>
                                    ) : (
                                        !hasMinimumInterests && (
                                            <p className="text-sm text-[#6f7a34]">{INTERESTS_HELPER_TEXT}</p>
                                        )
                                    )}

                                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={goToPreviousStep}
                                            className="h-12 flex-1 border-[#d7bf94] bg-white/80 text-kam-gray-dark"
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={continueFromInterests}
                                            disabled={isSubmitting || !hasMinimumInterests}
                                            className="h-12 flex-1 bg-[#b65d2c] text-white hover:bg-[#9f5227]"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    {createdUserId ? "Saving..." : "Creating account..."}
                                                </>
                                            ) : createdUserId ? (
                                                "Continue to profile"
                                            ) : (
                                                "Create account"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {stepIndex === 4 && (
                                <div className="space-y-8">
                                    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">Profile picture</Label>
                                                <div className="flex items-center gap-4 rounded-[24px] border border-[#e2d0a9] bg-white/70 p-4">
                                                    <div className="relative aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-full border border-white bg-white shadow-sm">
                                                        <Image
                                                            src={profilePicturePreview}
                                                            alt="Profile picture preview"
                                                            fill
                                                            sizes="96px"
                                                            className="rounded-full object-cover object-center"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label
                                                            htmlFor="signup-profile-picture"
                                                            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#d7bf94] bg-[#fff7e5] px-4 py-2 text-sm font-medium text-[#8a4d1f]"
                                                        >
                                                            <Camera className="h-4 w-4" />
                                                            Upload image
                                                        </label>
                                                        <input
                                                            id="signup-profile-picture"
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleProfilePictureChange}
                                                            className="hidden"
                                                        />
                                                        <p className="text-xs text-kam-gray-dark/60">
                                                            Upload an image so people can recognize you.
                                                        </p>
                                                        {!hasProfilePicture && (
                                                            <p className="text-xs text-[#9f5227]">
                                                                Required to finish onboarding.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">Cover image</Label>
                                                <div className="rounded-[24px] border border-[#e2d0a9] bg-white/70 p-4">
                                                    <MultiImageUploader
                                                        initialImages={[]}
                                                        onChange={setHeroImages}
                                                        maxImages={1}
                                                        previewMode="large"
                                                        enableReordering={false}
                                                        dropzoneClassName="h-40 border-[#d9c7a0] bg-[#fffdf6]"
                                                    />
                                                    <p className="mt-3 text-xs text-kam-gray-dark/60">
                                                        Add one cover image so your profile has some atmosphere.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-5">
                                            <div className="space-y-3">
                                                <Label htmlFor="signup-about">About me</Label>
                                                <Textarea
                                                    id="signup-about"
                                                    value={state.about}
                                                    onChange={(event) => updateField("about", event.target.value)}
                                                    placeholder="Tell people a little about yourself"
                                                    maxLength={SHORT_BIO_MAX_LENGTH}
                                                    className="min-h-[140px] border-[#d9c7a0] bg-white/80"
                                                />
                                                <p className="text-sm text-kam-gray-dark/62">
                                                    A short introduction, up to {SHORT_BIO_MAX_LENGTH} characters, appears under your name on your profile.
                                                </p>
                                                <p className="text-xs text-kam-gray-dark/52">
                                                    {state.about.length}/{SHORT_BIO_MAX_LENGTH}
                                                </p>
                                                {errors.about && <p className="text-sm text-red-600">{errors.about}</p>}
                                            </div>

                                            <div className="space-y-3">
                                                <Label htmlFor="signup-mission">My mission</Label>
                                                <Textarea
                                                    id="signup-mission"
                                                    value={state.mission}
                                                    onChange={(event) => updateField("mission", event.target.value)}
                                                    placeholder="What change do you want to contribute to?"
                                                    className="min-h-[160px] border-[#d9c7a0] bg-white/80"
                                                />
                                                <p className="text-sm text-kam-gray-dark/62">
                                                    Optional. You can add this now or come back to it later.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={goToPreviousStep}
                                            className="h-12 flex-1 border-[#d7bf94] bg-white/80 text-kam-gray-dark"
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={completeProfileSetup}
                                            disabled={isSubmitting || !canCompleteProfileSetup}
                                            className={cn(
                                                "h-12 flex-1 text-white",
                                                canCompleteProfileSetup
                                                    ? "bg-[#b65d2c] hover:bg-[#9f5227]"
                                                    : "bg-[#d9b68f] hover:bg-[#d9b68f]",
                                            )}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Finishing...
                                                </>
                                            ) : (
                                                "Go to my profile"
                                            )}
                                        </Button>
                                    </div>
                                    {!canCompleteProfileSetup && (
                                        <p className="text-sm text-[#9f5227]">
                                            Upload a profile image and add an About me before continuing.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <AnimatePresence>
                            {completionRedirectUrl && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center bg-[#fffaf2]/96 px-6"
                                >
                                    <motion.div
                                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -8, scale: 0.99 }}
                                        transition={{ duration: 0.35, ease: "easeOut" }}
                                        className="w-full max-w-md rounded-[28px] border border-white/80 bg-[#fff4d5] p-8 text-center shadow-[0_18px_48px_rgba(123,81,24,0.14)]"
                                    >
                                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/80 bg-[#fff8e7] shadow-sm">
                                            <div className="relative h-12 w-12">
                                                <Image
                                                    src="/images/kamooni_logo.png"
                                                    alt="Kamooni logo"
                                                    fill
                                                    className="object-contain"
                                                />
                                            </div>
                                        </div>
                                        <p className="mt-6 font-[family-name:var(--font-noto-serif)] text-3xl text-kam-gray-dark">
                                            You&apos;re in 🎉
                                        </p>
                                        <p className="mt-3 text-sm leading-6 text-kam-gray-dark/72 sm:text-base">
                                            Setting up your Kamooni profile now.
                                        </p>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

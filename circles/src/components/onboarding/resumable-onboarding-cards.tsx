"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCircleField } from "@/components/modules/home/actions";
import {
    acceptOnboardingCommunityGuidelinesAction,
    saveOnboardingIntroductionAction,
    saveOnboardingLocationAction,
} from "@/app/onboarding/card-actions";
import {
    type CommunityGuidelineAgreementState,
    COMMUNITY_GUIDELINE_RULES,
    getAcceptedCommunityGuidelineCount,
    isCommunityGuidelinesCompleted,
    normalizeCommunityGuidelineAgreementState,
} from "@/lib/community-guidelines";
import { hasRealProfileImage, hasSelectedProfileLocation } from "@/lib/profile-completion";
import type { Location } from "@/models/models";

const LocationPicker = dynamic(() => import("@/components/forms/location-picker"), {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-lg bg-muted" aria-label="Loading location map" />,
});

type OnboardingCardProfile = {
    circleId?: string;
    handle?: string;
    description?: string;
    content?: string;
    communityGuidelinesAcceptance?: Partial<CommunityGuidelineAgreementState>;
    location?: Location;
    pictureUrl?: string;
};

type HumanVerificationStatus = {
    realPersonCount: number;
    metInRealLifeCount: number;
};

type CardProps = {
    profile: OnboardingCardProfile;
    humanVerification: HumanVerificationStatus;
    onUnsavedChange: (hasUnsavedChanges: boolean) => void;
    onSavingChange: (isSaving: boolean) => void;
    onSaved: () => void;
};

export function IntroductionOnboardingCard({ profile, onUnsavedChange, onSavingChange, onSaved }: CardProps) {
    const [value, setValue] = useState(profile.description || profile.content || "");
    const [savedDescription, setSavedDescription] = useState(profile.description || "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const isDirty = value !== savedDescription || saving;

    useEffect(() => onUnsavedChange(isDirty), [isDirty, onUnsavedChange]);

    const save = async () => {
        setError("");
        setMessage("");
        if (!value.trim()) {
            setError("Write at least one non-whitespace character for your introduction.");
            return;
        }
        setSaving(true);
        onSavingChange(true);
        try {
            const result = await saveOnboardingIntroductionAction(value);
            if (!result.success || result.value === undefined) {
                setError(result.message || "We couldn’t save your introduction. Please try again.");
                return;
            }
            setValue(result.value);
            setSavedDescription(result.value);
            setMessage("Your introduction is saved.");
            onSaved();
        } catch {
            setError("We couldn’t save your introduction. Please try again.");
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };

    return (
        <section className="space-y-4" aria-labelledby="onboarding-introduction-heading">
            <div>
                <h2 id="onboarding-introduction-heading" className="text-lg font-semibold">
                    What brings you to Kamooni?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    A sentence or a few words is enough. You can edit this any time.
                </p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="onboarding-introduction">Your introduction</Label>
                <Textarea
                    id="onboarding-introduction"
                    value={value}
                    onChange={(event) => {
                        setValue(event.target.value);
                        onUnsavedChange(event.target.value !== savedDescription);
                        setError("");
                        setMessage("");
                    }}
                    placeholder="I’m here to…"
                    rows={4}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "onboarding-introduction-error" : "onboarding-introduction-help"}
                />
                {error ? (
                    <p id="onboarding-introduction-error" role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : (
                    <p id="onboarding-introduction-help" className="text-sm text-muted-foreground">
                        No minimum length.
                    </p>
                )}
            </div>
            {message && (
                <p role="status" className="text-sm text-green-700">
                    {message}
                </p>
            )}
            <Button
                type="button"
                onClick={save}
                disabled={saving || !value.trim()}
                className="min-h-11 w-full sm:w-auto"
            >
                {saving ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                    </>
                ) : (
                    "Save introduction"
                )}
            </Button>
        </section>
    );
}

export function CommunityGuidelinesOnboardingCard({ profile, onUnsavedChange, onSavingChange, onSaved }: CardProps) {
    const acceptance = useMemo(
        () => normalizeCommunityGuidelineAgreementState(profile.communityGuidelinesAcceptance),
        [profile.communityGuidelinesAcceptance],
    );
    const [agreed, setAgreed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const alreadyAccepted = isCommunityGuidelinesCompleted(acceptance);
    const acceptedCount = getAcceptedCommunityGuidelineCount(acceptance);

    useEffect(() => onUnsavedChange(agreed && !alreadyAccepted), [agreed, alreadyAccepted, onUnsavedChange]);

    const accept = async () => {
        if (!agreed || alreadyAccepted) return;
        setSaving(true);
        onSavingChange(true);
        setError("");
        setMessage("");
        try {
            const result = await acceptOnboardingCommunityGuidelinesAction(agreed);
            if (!result.success || !result.value) {
                setError(result.message || "We couldn’t save your agreement. Please try again.");
                return;
            }
            setAgreed(false);
            setMessage("You’ve accepted the Community Guidelines.");
            onUnsavedChange(false);
            onSaved();
        } catch {
            setError("We couldn’t save your agreement. Please try again.");
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };

    return (
        <section className="space-y-4" aria-labelledby="onboarding-guidelines-heading">
            <div>
                <h2 id="onboarding-guidelines-heading" className="text-lg font-semibold">
                    Community Guidelines
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    These shared principles help make Kamooni a respectful place to take part.
                </p>
            </div>
            <div
                tabIndex={0}
                role="region"
                aria-label="Community Guidelines text"
                className="max-h-72 space-y-5 overflow-y-auto rounded-lg border bg-background p-4 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {COMMUNITY_GUIDELINE_RULES.map((rule) => (
                    <article key={rule.id} className="space-y-1">
                        <h3 className="font-medium">{rule.title}</h3>
                        <p className="text-sm leading-6 text-muted-foreground">{rule.body}</p>
                    </article>
                ))}
            </div>
            {alreadyAccepted ? (
                <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm" role="status">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                    <div>
                        <p className="font-medium">You’ve already accepted the Community Guidelines.</p>
                        <p className="text-muted-foreground">
                            Your existing per-principle acceptance records are saved.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {acceptedCount > 0 && (
                        <p className="text-sm text-muted-foreground">
                            {acceptedCount} of {COMMUNITY_GUIDELINE_RULES.length} principles were accepted earlier.
                            Those records and timestamps will be preserved.
                        </p>
                    )}
                    <div className="flex items-start gap-3 rounded-md border p-3">
                        <Checkbox
                            id="onboarding-guidelines-agreement"
                            checked={agreed}
                            onCheckedChange={(checked) => {
                                setAgreed(checked === true);
                                onUnsavedChange(checked === true && !alreadyAccepted);
                                setError("");
                                setMessage("");
                            }}
                            aria-describedby={error ? "onboarding-guidelines-error" : undefined}
                        />
                        <Label htmlFor="onboarding-guidelines-agreement" className="cursor-pointer leading-5">
                            I have read and agree to the Community Guidelines.
                        </Label>
                    </div>
                    {error && (
                        <p id="onboarding-guidelines-error" role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <Button
                        type="button"
                        onClick={accept}
                        disabled={!agreed || saving}
                        className="min-h-11 w-full sm:w-auto"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Accept Community Guidelines"
                        )}
                    </Button>
                </div>
            )}
            {message && (
                <p role="status" className="text-sm text-green-700">
                    {message}
                </p>
            )}
        </section>
    );
}

export function LocationOnboardingCard({ profile, onUnsavedChange, onSavingChange, onSaved }: CardProps) {
    const [location, setLocation] = useState<Location | undefined>(profile.location);
    const [savedLocation, setSavedLocation] = useState<Location | undefined>(profile.location);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const isDirty = JSON.stringify(location) !== JSON.stringify(savedLocation) || saving;
    const validSelectedLocation = hasSelectedProfileLocation({ location });

    useEffect(() => onUnsavedChange(isDirty), [isDirty, onUnsavedChange]);

    const save = async () => {
        if (!location || !validSelectedLocation) {
            setError("Choose a place on the map or search for a location before saving.");
            return;
        }
        setSaving(true);
        onSavingChange(true);
        setError("");
        setMessage("");
        try {
            const result = await saveOnboardingLocationAction(location);
            if (!result.success || !result.value) {
                setError(result.message || "We couldn’t save your location. Please try again.");
                return;
            }
            setLocation(result.value);
            setSavedLocation(result.value);
            setMessage("Your location is saved with the selected precision.");
            onSaved();
        } catch {
            setError("We couldn’t save your location. Please try again.");
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };

    return (
        <section className="space-y-4" aria-labelledby="onboarding-location-heading">
            <div>
                <h2 id="onboarding-location-heading" className="text-lg font-semibold">
                    Choose your location
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Optional. Search for a place or select it directly on the map. You don’t need to share an exact
                    address.
                </p>
            </div>
            <div className="rounded-lg border p-3 sm:p-4">
                <div className="mb-4 space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                    <h3 className="font-medium">Choose where people can find you</h3>
                    <p className="text-muted-foreground">
                        Select a nearby public place, such as a café, park or library, rather than your home address.
                        Somewhere you could comfortably reach within 30 minutes is a good starting point. Your selected
                        location will be visible to other Kamooni members.
                    </p>
                </div>
                <LocationPicker
                    value={location}
                    onChange={(next) => {
                        setLocation(next);
                        onUnsavedChange(JSON.stringify(next) !== JSON.stringify(savedLocation));
                        setError("");
                        setMessage("");
                    }}
                    compact
                    personalProfile
                />
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {message && (
                <p role="status" className="text-sm text-green-700">
                    {message}
                </p>
            )}
            <Button
                type="button"
                onClick={save}
                disabled={saving || !validSelectedLocation}
                className="min-h-11 w-full sm:w-auto"
            >
                {saving ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                    </>
                ) : (
                    <>
                        <MapPin className="mr-2 h-4 w-4" />
                        Save location
                    </>
                )}
            </Button>
        </section>
    );
}

export function ProfilePhotoOnboardingCard({ profile, onUnsavedChange, onSavingChange, onSaved }: CardProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState(profile.pictureUrl || "/images/default-user-picture.png");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const objectUrlRef = useRef<string | null>(null);
    const realPhoto = hasRealProfileImage({ picture: profile.pictureUrl ? { url: profile.pictureUrl } : undefined });

    useEffect(() => onUnsavedChange(Boolean(file)), [file, onUnsavedChange]);
    useEffect(
        () => () => {
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        },
        [],
    );

    const selectFile = (nextFile?: File) => {
        if (!nextFile) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = URL.createObjectURL(nextFile);
        setFile(nextFile);
        setPreviewUrl(objectUrlRef.current);
        setError("");
        setMessage("");
    };

    const upload = async () => {
        if (!file || !profile.circleId) {
            setError("Choose a profile picture before uploading.");
            return;
        }
        setSaving(true);
        onSavingChange(true);
        setError("");
        setMessage("");
        try {
            const formData = new FormData();
            formData.set("picture", file);
            const result = await updateCircleField(profile.circleId, formData);
            const savedUrl = result.circle?.picture?.url;
            if (!result.success || !savedUrl) {
                setError(result.message || "We couldn’t upload your picture. Please try again.");
                return;
            }
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
            setPreviewUrl(savedUrl);
            setFile(null);
            setMessage("Your profile picture is saved.");
            onSaved();
        } catch {
            setError("We couldn’t upload your picture. Please try again.");
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };

    return (
        <section className="space-y-4" aria-labelledby="onboarding-photo-heading">
            <div>
                <h2 id="onboarding-photo-heading" className="text-lg font-semibold">
                    Add a profile picture
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Optional for participation. A genuine picture and a selected location are both needed before a
                    personal profile can appear on the map.
                </p>
            </div>
            <div className="flex flex-col items-center gap-4 rounded-lg border p-4 sm:flex-row sm:items-start">
                <img
                    src={previewUrl}
                    alt={realPhoto ? "Your current profile picture" : "Default profile picture preview"}
                    className="h-28 w-28 rounded-full border object-cover"
                />
                <div className="w-full space-y-3">
                    <Label htmlFor="onboarding-profile-photo" className="block text-sm font-medium">
                        Choose an image file
                    </Label>
                    <input
                        ref={inputRef}
                        id="onboarding-profile-photo"
                        type="file"
                        accept="image/*"
                        onChange={(event) => selectFile(event.target.files?.[0])}
                        className="block min-h-11 w-full cursor-pointer rounded-md border p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-describedby="onboarding-profile-photo-help"
                    />
                    <p id="onboarding-profile-photo-help" className="text-sm text-muted-foreground">
                        Kamooni’s existing image validation and secure profile storage will be used.
                    </p>
                    {file && (
                        <Button type="button" onClick={upload} disabled={saving} className="min-h-11 w-full sm:w-auto">
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Uploading…
                                </>
                            ) : (
                                <>
                                    <ImagePlus className="mr-2 h-4 w-4" />
                                    Upload picture
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {message && (
                <p role="status" className="text-sm text-green-700">
                    {message}
                </p>
            )}
        </section>
    );
}

export function HumanVerificationOnboardingCard({ profile, humanVerification }: CardProps) {
    const verified = humanVerification.realPersonCount > 0;
    const verificationHref = profile.handle
        ? `/circles/${encodeURIComponent(profile.handle)}/home#proof-of-humanity`
        : "/explore";

    return (
        <section className="space-y-4" aria-labelledby="onboarding-humanity-heading">
            <div>
                <h2 id="onboarding-humanity-heading" className="text-lg font-semibold">
                    Get human-verified
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Human verification helps members build trust and show that real people are part of Kamooni. It is
                    optional during Phase 1.
                </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4" role="status">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="space-y-1">
                    <p className="font-medium">
                        {verified
                            ? "Your profile has a real-person confirmation."
                            : "Your profile does not have a real-person confirmation yet."}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Real person: {humanVerification.realPersonCount}. Met in real life:{" "}
                        {humanVerification.metInRealLifeCount}.
                    </p>
                </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
                “Real person” confirms that you are a real person. “Met in real life” separately records that someone
                has met you physically. Existing verifications remain distinct.
            </p>
            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
                <Link href={verificationHref}>
                    {verified ? "Review your verification" : "Open your verification section"}
                </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
                Ask a member who knows you to open your profile and use its existing Verify Human action.
            </p>
        </section>
    );
}

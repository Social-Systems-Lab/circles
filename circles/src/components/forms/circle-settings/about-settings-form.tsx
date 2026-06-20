"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, Controller, Control, FieldValues } from "react-hook-form";
import { saveAbout } from "@/app/circles/[handle]/settings/about/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DynamicField,
    DynamicTextField,
    DynamicTextareaField,
    DynamicImageField,
    DynamicSwitchField,
    DynamicLocationField,
    DynamicArrayField,
} from "@/components/forms/dynamic-field";
import { getUserPrivateAction } from "@/components/modules/home/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { socialPlatforms } from "@/lib/data/social";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    getPeerifyArtistProfile,
    getPeerifyArtistIdentityLabel,
    getPeerifyVenueProfile,
    hasPeerifyArtistIntent,
    isPeerifyManagedIdentity,
    isPeerifyVenueIdentity,
    PEERIFY_ARTIST_TYPE_OPTIONS,
    PEERIFY_EVENT_TYPE_OPTIONS,
    PEERIFY_LOOKING_FOR_OPTIONS,
    type PeerifyArtistProfile,
    type PeerifyVenueProfile,
} from "@/lib/peerify/artist-profile";
import { ABOUT_IMAGE_UPLOAD_MAX_BYTES, ABOUT_IMAGE_UPLOAD_MAX_MB } from "@/lib/image-upload-limits";

type AboutSettingsFormValues = {
    _id: any;
    name?: string;
    handle?: string;
    description?: string;
    content?: string;
    mission?: string;
    picture?: any;
    images?: ImageItem[];
    isPublic?: boolean;
    showAdminsPublicly?: boolean;
    location?: any;
    socialLinks?: any;
    websiteUrl?: string;
    representsOrganization?: boolean;
    organizationName?: string;
    officialEmail?: string;
    peerifyArtistIntent?: boolean;
    peerifyArtistProfile: {
        artistTypes: string[];
        genresText: string;
        baseCity: string;
        musicLinks: Record<string, string>;
        featuredLink: string;
        lookingFor: string[];
        bookingEnabled: boolean;
        bookingSettings: {
            localBookingsOnly: boolean;
            travelRadiusKm: string;
            preferredEventTypes: string[];
            minimumAudienceSize: string;
            preferredAudienceSize: string;
            baseFee: string;
            currency: string;
            needsAccommodation: boolean;
            needsTransport: boolean;
            needsMeal: boolean;
            technicalNeeds: string;
            notes: string;
        };
        availability: string;
    };
    peerifyVenueProfile: PeerifyVenueProfile;
};

const parseDelimitedList = (value?: string): string[] =>
    (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const stringifyOptionalNumber = (value?: number): string => (typeof value === "number" ? String(value) : "");

const parseOptionalNumber = (value?: string): number | undefined => {
    if (!value?.trim()) {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const buildArtistProfileFormDefaults = (circle: Circle): AboutSettingsFormValues["peerifyArtistProfile"] => {
    const artistProfile = getPeerifyArtistProfile(circle);

    return {
        artistTypes: artistProfile.artistTypes,
        genresText: artistProfile.genres.join(", "),
        baseCity: artistProfile.baseCity,
        musicLinks: {
            bandcamp: artistProfile.musicLinks.bandcamp || "",
            spotify: artistProfile.musicLinks.spotify || "",
            soundcloud: artistProfile.musicLinks.soundcloud || "",
            appleMusic: artistProfile.musicLinks.appleMusic || "",
            youtube: artistProfile.musicLinks.youtube || "",
            linktree: artistProfile.musicLinks.linktree || "",
            website: artistProfile.musicLinks.website || "",
        },
        featuredLink: artistProfile.featuredLink || "",
        lookingFor: artistProfile.lookingFor,
        bookingEnabled: artistProfile.bookingEnabled,
        bookingSettings: {
            localBookingsOnly: artistProfile.bookingSettings.localBookingsOnly === true,
            travelRadiusKm: stringifyOptionalNumber(artistProfile.bookingSettings.travelRadiusKm),
            preferredEventTypes: artistProfile.bookingSettings.preferredEventTypes || [],
            minimumAudienceSize: stringifyOptionalNumber(artistProfile.bookingSettings.minimumAudienceSize),
            preferredAudienceSize: stringifyOptionalNumber(artistProfile.bookingSettings.preferredAudienceSize),
            baseFee: stringifyOptionalNumber(artistProfile.bookingSettings.baseFee),
            currency: artistProfile.bookingSettings.currency || "",
            needsAccommodation: artistProfile.bookingSettings.needsAccommodation === true,
            needsTransport: artistProfile.bookingSettings.needsTransport === true,
            needsMeal: artistProfile.bookingSettings.needsMeal === true,
            technicalNeeds: artistProfile.bookingSettings.technicalNeeds || "",
            notes: artistProfile.bookingSettings.notes || "",
        },
        availability: artistProfile.availability || "",
    };
};

const buildVenueProfileFormDefaults = (circle: Circle): PeerifyVenueProfile => {
    const venueProfile = getPeerifyVenueProfile(circle);

    return {
        venueType: venueProfile.venueType || "",
        publicCity: venueProfile.publicCity || "",
        address: venueProfile.address || "",
        addressVisibility: venueProfile.addressVisibility || "private",
        capacityStanding: venueProfile.capacityStanding || "",
        capacitySeated: venueProfile.capacitySeated || "",
        typicalShowCapacity: venueProfile.typicalShowCapacity || "",
        accessibilityNotes: venueProfile.accessibilityNotes || "",
        agePolicy: venueProfile.agePolicy || "",
        paAvailable: venueProfile.paAvailable === true,
        inHouseEngineer: venueProfile.inHouseEngineer === true,
        backline: venueProfile.backline || "",
        lighting: venueProfile.lighting || "",
        loadInNotes: venueProfile.loadInNotes || "",
        parkingNotes: venueProfile.parkingNotes || "",
        minimumFee: venueProfile.minimumFee || "",
        doorSplit: venueProfile.doorSplit || "",
        houseCut: venueProfile.houseCut || "",
        peerifyFeeCoveredBy: venueProfile.peerifyFeeCoveredBy || "not_specified",
        availableDays: venueProfile.availableDays || "",
        typicalResponseTime: venueProfile.typicalResponseTime || "",
        bookingNote: venueProfile.bookingNote || "",
        bookingEnquiriesEnabled: venueProfile.bookingEnquiriesEnabled === true,
        greenRoom: venueProfile.greenRoom === true,
        foodDrink: venueProfile.foodDrink || "",
        accommodationHelp: venueProfile.accommodationHelp || "",
        localTransportHelp: venueProfile.localTransportHelp || "",
        merchTable: venueProfile.merchTable === true,
        guestListPolicy: venueProfile.guestListPolicy || "",
        houseRules: venueProfile.houseRules || "",
        soundCurfew: venueProfile.soundCurfew || "",
        cancellationPolicy: venueProfile.cancellationPolicy || "",
        safetyPolicy: venueProfile.safetyPolicy || "",
        website: venueProfile.website || "",
        instagram: venueProfile.instagram || "",
        contactEmail: venueProfile.contactEmail || "",
    };
};

const CheckboxGroup = ({
    label,
    description,
    options,
    values,
    onChange,
}: {
    label: string;
    description?: string;
    options: readonly string[];
    values: string[];
    onChange: (values: string[]) => void;
}) => (
    <div className="space-y-3">
        <div>
            <Label>{label}</Label>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => {
                const checked = values.includes(option);
                return (
                    <label key={option} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                        <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                                if (nextChecked) {
                                    onChange([...values, option]);
                                    return;
                                }
                                onChange(values.filter((value) => value !== option));
                            }}
                        />
                        <span>{option}</span>
                    </label>
                );
            })}
        </div>
    </div>
);

const ArtistTextField = ({
    label,
    placeholder,
    description,
    value,
    onChange,
    type = "text",
}: {
    label: string;
    placeholder?: string;
    description?: string;
    value?: string;
    onChange: (value: string) => void;
    type?: string;
}) => (
    <div className="space-y-2">
        <Label>{label}</Label>
        <Input
            type={type}
            placeholder={placeholder}
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
        />
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
);

const ArtistTextareaField = ({
    label,
    placeholder,
    description,
    value,
    onChange,
    rows = 4,
}: {
    label: string;
    placeholder?: string;
    description?: string;
    value?: string;
    onChange: (value: string) => void;
    rows?: number;
}) => (
    <div className="space-y-2">
        <Label>{label}</Label>
        <Textarea
            rows={rows}
            placeholder={placeholder}
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
        />
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
);

const PeerifySelectField = ({
    label,
    description,
    value,
    onChange,
    options,
}: {
    label: string;
    description?: string;
    value?: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
}) => (
    <div className="space-y-2">
        <Label>{label}</Label>
        <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
);

const PeerifyCheckboxField = ({
    label,
    description,
    value,
    onChange,
}: {
    label: string;
    description?: string;
    value?: boolean;
    onChange: (value: boolean) => void;
}) => (
    <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
        <span>
            <span className="block">{label}</span>
            {description ? <span className="mt-1 block text-muted-foreground">{description}</span> : null}
        </span>
    </label>
);

const VENUE_TYPE_OPTIONS = [
    { value: "", label: "Select venue type" },
    { value: "Bar", label: "Bar" },
    { value: "Café", label: "Café" },
    { value: "Club", label: "Club" },
    { value: "Theatre", label: "Theatre" },
    { value: "Gallery", label: "Gallery" },
    { value: "Community space", label: "Community space" },
    { value: "House venue", label: "House venue" },
    { value: "Outdoor", label: "Outdoor" },
    { value: "Other", label: "Other" },
];

const ADDRESS_VISIBILITY_OPTIONS = [
    { value: "private", label: "Private, show city/area only" },
    { value: "city_area", label: "Approximate/city-area" },
    { value: "public", label: "Public" },
];

const PEERIFY_FEE_COVERED_BY_OPTIONS = [
    { value: "not_specified", label: "Not specified" },
    { value: "venue", label: "Venue" },
    { value: "artist", label: "Artist" },
    { value: "shared", label: "Shared" },
];

interface AboutSettingsFormProps {
    circle: Circle;
}

export function AboutSettingsForm({ circle }: AboutSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isIndependentCircle = circle.circleType !== "user" && circle.circleLevel !== "profile_child";
    const isUserProfile = circle.circleType === "user";
    const isPeerifyManagedVenueCircle = isPeerifyVenueIdentity(circle);
    const isPeerifyManagedArtistCircle = isPeerifyManagedIdentity(circle) && !isPeerifyManagedVenueCircle;
    const canEditPeerifyArtistProfile = isUserProfile || isPeerifyManagedArtistCircle;
    const canEditPeerifyVenueProfile = isPeerifyManagedVenueCircle;
    const artistProfileDefaults = buildArtistProfileFormDefaults(circle);
    const venueProfileDefaults = buildVenueProfileFormDefaults(circle);

    const form = useForm<AboutSettingsFormValues>({
        defaultValues: {
            _id: circle._id,
            name: circle.name || "",
            handle: circle.handle || "",
            description: circle.description || "",
            content: circle.content || "",
            mission: circle.mission || "",
            picture: (circle.picture as any) || undefined, // Keep current picture for preview/update
            // cover: undefined as any, // Remove cover
            images:
                circle.images?.map(
                    (media): ImageItem => ({
                        id: media.fileInfo.url, // Use URL as ID for existing
                        preview: media.fileInfo.url,
                        existingMediaUrl: media.fileInfo.url,
                    }),
                ) || [], // Initialize images state
            isPublic: circle.isPublic !== false, // Default to true if not set
            showAdminsPublicly: circle.showAdminsPublicly !== false, // Keep existing circles visible unless explicitly turned off
            location: circle.location || {},
            socialLinks: circle.socialLinks || [],
            websiteUrl: circle.websiteUrl || "",
            representsOrganization: circle.representsOrganization === true,
            organizationName: circle.organizationName || "",
            officialEmail: circle.officialEmail || "",
            peerifyArtistIntent: hasPeerifyArtistIntent(circle),
            peerifyArtistProfile: artistProfileDefaults,
            peerifyVenueProfile: venueProfileDefaults,
        },
    });

    const representsOrganization = form.watch("representsOrganization");
    const peerifyArtistIntent = form.watch("peerifyArtistIntent");
    const bookingEnabled = form.watch("peerifyArtistProfile.bookingEnabled");
    const venueBookingEnabled = form.watch("peerifyVenueProfile.bookingEnquiriesEnabled");

    const onSubmit = async (data: AboutSettingsFormValues) => {
        setIsSubmitting(true);
        try {
            const peerifyArtistProfile: PeerifyArtistProfile = {
                artistTypes: data.peerifyArtistProfile.artistTypes,
                baseCity: data.peerifyArtistProfile.baseCity.trim(),
                genres: parseDelimitedList(data.peerifyArtistProfile.genresText),
                musicLinks: Object.fromEntries(
                    Object.entries(data.peerifyArtistProfile.musicLinks).filter(([, value]) => value.trim().length > 0),
                ),
                featuredLink: data.peerifyArtistProfile.featuredLink.trim() || undefined,
                lookingFor: data.peerifyArtistProfile.lookingFor,
                bookingEnabled: data.peerifyArtistProfile.bookingEnabled,
                bookingSettings: {
                    localBookingsOnly: data.peerifyArtistProfile.bookingSettings.localBookingsOnly || undefined,
                    travelRadiusKm: parseOptionalNumber(data.peerifyArtistProfile.bookingSettings.travelRadiusKm),
                    preferredEventTypes: data.peerifyArtistProfile.bookingSettings.preferredEventTypes,
                    minimumAudienceSize: parseOptionalNumber(
                        data.peerifyArtistProfile.bookingSettings.minimumAudienceSize,
                    ),
                    preferredAudienceSize: parseOptionalNumber(
                        data.peerifyArtistProfile.bookingSettings.preferredAudienceSize,
                    ),
                    baseFee: parseOptionalNumber(data.peerifyArtistProfile.bookingSettings.baseFee),
                    currency: data.peerifyArtistProfile.bookingSettings.currency.trim() || undefined,
                    needsAccommodation: data.peerifyArtistProfile.bookingSettings.needsAccommodation || undefined,
                    needsTransport: data.peerifyArtistProfile.bookingSettings.needsTransport || undefined,
                    needsMeal: data.peerifyArtistProfile.bookingSettings.needsMeal || undefined,
                    technicalNeeds: data.peerifyArtistProfile.bookingSettings.technicalNeeds.trim() || undefined,
                    notes: data.peerifyArtistProfile.bookingSettings.notes.trim() || undefined,
                },
                availability: data.peerifyArtistProfile.availability.trim() || undefined,
            };
            const peerifyVenueProfile: PeerifyVenueProfile = {
                ...data.peerifyVenueProfile,
                venueType: data.peerifyVenueProfile.venueType?.trim() || undefined,
                publicCity: data.peerifyVenueProfile.publicCity?.trim() || undefined,
                address: data.peerifyVenueProfile.address?.trim() || undefined,
                capacityStanding: data.peerifyVenueProfile.capacityStanding?.trim() || undefined,
                capacitySeated: data.peerifyVenueProfile.capacitySeated?.trim() || undefined,
                typicalShowCapacity: data.peerifyVenueProfile.typicalShowCapacity?.trim() || undefined,
                accessibilityNotes: data.peerifyVenueProfile.accessibilityNotes?.trim() || undefined,
                agePolicy: data.peerifyVenueProfile.agePolicy?.trim() || undefined,
                backline: data.peerifyVenueProfile.backline?.trim() || undefined,
                lighting: data.peerifyVenueProfile.lighting?.trim() || undefined,
                loadInNotes: data.peerifyVenueProfile.loadInNotes?.trim() || undefined,
                parkingNotes: data.peerifyVenueProfile.parkingNotes?.trim() || undefined,
                minimumFee: data.peerifyVenueProfile.minimumFee?.trim() || undefined,
                doorSplit: data.peerifyVenueProfile.doorSplit?.trim() || undefined,
                houseCut: data.peerifyVenueProfile.houseCut?.trim() || undefined,
                availableDays: data.peerifyVenueProfile.availableDays?.trim() || undefined,
                typicalResponseTime: data.peerifyVenueProfile.typicalResponseTime?.trim() || undefined,
                bookingNote: data.peerifyVenueProfile.bookingNote?.trim() || undefined,
                foodDrink: data.peerifyVenueProfile.foodDrink?.trim() || undefined,
                accommodationHelp: data.peerifyVenueProfile.accommodationHelp?.trim() || undefined,
                localTransportHelp: data.peerifyVenueProfile.localTransportHelp?.trim() || undefined,
                guestListPolicy: data.peerifyVenueProfile.guestListPolicy?.trim() || undefined,
                houseRules: data.peerifyVenueProfile.houseRules?.trim() || undefined,
                soundCurfew: data.peerifyVenueProfile.soundCurfew?.trim() || undefined,
                cancellationPolicy: data.peerifyVenueProfile.cancellationPolicy?.trim() || undefined,
                safetyPolicy: data.peerifyVenueProfile.safetyPolicy?.trim() || undefined,
                website: data.peerifyVenueProfile.website?.trim() || undefined,
                instagram: data.peerifyVenueProfile.instagram?.trim() || undefined,
                contactEmail: data.peerifyVenueProfile.contactEmail?.trim() || undefined,
            };

            const result = await saveAbout({
                ...data,
                peerifyArtistIntent: data.peerifyArtistIntent,
                peerifyArtistProfile,
                peerifyVenueProfile,
            });
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Circle profile updated successfully",
                });
                let userData = await getUserPrivateAction();
                setUser(userData);

                if (result.newHandle) {
                    const newPath = `/circles/${result.newHandle}/settings/about`;
                    console.log(`Handle changed, redirecting to: ${newPath}`);
                    router.push(newPath);
                } else {
                    router.refresh();
                }
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update circle profile",
                    variant: "destructive",
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unexpected error occurred";
            const hasPendingImageUploads =
                form.getValues("picture") instanceof File ||
                form.getValues("images")?.some((imageItem) => imageItem.file instanceof File);
            const uploadMessage =
                hasPendingImageUploads && message === "An unexpected response was received from the server."
                    ? `The image upload was rejected by the server. Please upload images under ${ABOUT_IMAGE_UPLOAD_MAX_MB} MB.`
                    : message;
            toast({
                title: "Error",
                description: uploadMessage,
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderSaveButton = () => (
        <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
    );

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="formatted space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Controller
                            name="name"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextField
                                    field={{ name: "name", type: "text", label: "Name", required: true }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="handle"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextField
                                    field={{
                                        name: "handle",
                                        type: "text",
                                        label: "Handle",
                                        placeholder: "handle",
                                        description: {
                                            circle: "Choose a unique handle that will identify the circle on the platform.",
                                            user: "Choose a unique handle that will identify you on the platform.",
                                        },
                                        required: true,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        {!isIndependentCircle || !representsOrganization ? (
                            <Controller
                                name="websiteUrl"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    <DynamicTextField
                                        field={{
                                            name: "websiteUrl",
                                            type: "text",
                                            label: "Website",
                                            placeholder: "https://your-website.org",
                                            description: {
                                                circle: "Your community or organization website.",
                                                user: "Your personal website.",
                                            },
                                        }}
                                        formField={field}
                                        control={form.control as unknown as Control}
                                    />
                                )}
                            />
                        ) : null}

                        {isIndependentCircle ? (
                            <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                                <div className="space-y-1">
                                    <h3 className="font-medium">Organization Claim</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Independent circles that represent an existing organization may require extra
                                        verification, such as an official email tied to that organization.
                                    </p>
                                </div>

                                <Controller
                                    name="representsOrganization"
                                    control={form.control as unknown as Control}
                                    render={({ field }) => (
                                        <DynamicSwitchField
                                            field={{
                                                name: "representsOrganization",
                                                type: "switch",
                                                label: "This circle represents an existing organization",
                                            }}
                                            formField={field}
                                            control={form.control as unknown as Control}
                                        />
                                    )}
                                />

                                {representsOrganization ? (
                                    <div className="space-y-4">
                                        <Controller
                                            name="organizationName"
                                            control={form.control as unknown as Control}
                                            render={({ field }) => (
                                                <DynamicTextField
                                                    field={{
                                                        name: "organizationName",
                                                        type: "text",
                                                        label: "Official organization name",
                                                        placeholder: "Official organization name",
                                                        description:
                                                            "Store the formal organization name exactly as admins should review it.",
                                                    }}
                                                    formField={field}
                                                    control={form.control as unknown as Control}
                                                />
                                            )}
                                        />

                                        <Controller
                                            name="websiteUrl"
                                            control={form.control as unknown as Control}
                                            render={({ field }) => (
                                                <DynamicTextField
                                                    field={{
                                                        name: "websiteUrl",
                                                        type: "text",
                                                        label: "Official website",
                                                        placeholder: "https://organization.org",
                                                        description:
                                                            "This website is used as organization-claim evidence during verification review.",
                                                    }}
                                                    formField={field}
                                                    control={form.control as unknown as Control}
                                                />
                                            )}
                                        />

                                        <Controller
                                            name="officialEmail"
                                            control={form.control as unknown as Control}
                                            render={({ field }) => (
                                                <DynamicTextField
                                                    field={{
                                                        name: "officialEmail",
                                                        type: "text",
                                                        label: "Official email",
                                                        placeholder: "name@organization.org",
                                                        description:
                                                            "Use an email address connected to the organization if available.",
                                                    }}
                                                    formField={field}
                                                    control={form.control as unknown as Control}
                                                />
                                            )}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <Controller
                            name="description"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "description",
                                        type: "textarea",
                                        label: "Description",
                                        placeholder: "Description",
                                        description: {
                                            circle: "Describe the circle in a few words.",
                                            user: "Describe yourself in a few words.",
                                        },
                                        maxLength: 200,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="mission"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "mission",
                                        type: "textarea",
                                        label: { user: "Your Mission", circle: "Mission" },
                                        placeholder: "Description",
                                        description: {
                                            circle: "Define the circle's purpose and the change it wants to see in the world.",
                                            user: "Define your purpose and the change you want to see in the world.",
                                        },
                                        maxLength: 500,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="content"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "content",
                                        type: "textarea",
                                        label: "Content",
                                        placeholder: "Detailed information about your circle",
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
                    </CardContent>
                </Card>

                {renderSaveButton()}

                {canEditPeerifyArtistProfile ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {isPeerifyManagedArtistCircle
                                    ? `${getPeerifyArtistIdentityLabel(circle)} Identity`
                                    : "Peerify Artist Profile"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isUserProfile ? (
                                <Controller
                                    name="peerifyArtistIntent"
                                    control={form.control}
                                    render={({ field }) => (
                                        <div className="space-y-2">
                                            <Label>Enable artist profile</Label>
                                            <div className="flex items-center gap-3 rounded-lg border p-4">
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                                />
                                                <div>
                                                    <p className="font-medium">
                                                        This profile represents an artist or music project
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        This turns on Peerify artist metadata and public artist
                                                        sections.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                />
                            ) : (
                                <div className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
                                    This managed identity is published as a public Peerify{" "}
                                    {getPeerifyArtistIdentityLabel(circle).toLowerCase()}.
                                </div>
                            )}

                            {peerifyArtistIntent || isPeerifyManagedArtistCircle ? (
                                <>
                                    <Controller
                                        name="peerifyArtistProfile.artistTypes"
                                        control={form.control}
                                        render={({ field }) => (
                                            <CheckboxGroup
                                                label="Artist types"
                                                description="Pick the formats that best describe this act."
                                                options={PEERIFY_ARTIST_TYPE_OPTIONS}
                                                values={field.value || []}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Controller
                                            name="peerifyArtistProfile.baseCity"
                                            control={form.control}
                                            render={({ field }) => (
                                                <ArtistTextField
                                                    label="Base city"
                                                    placeholder="Berlin"
                                                    description="Show a city or broad location, not an exact address."
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            )}
                                        />
                                        <Controller
                                            name="peerifyArtistProfile.genresText"
                                            control={form.control}
                                            render={({ field }) => (
                                                <ArtistTextField
                                                    label="Genres / sound tags"
                                                    placeholder="Indie folk, dream pop, ambient"
                                                    description="Comma-separated tags."
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <Label>Music links</Label>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                Add the places where listeners can hear, buy, or follow this project.
                                            </p>
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            {(
                                                [
                                                    ["bandcamp", "Bandcamp"],
                                                    ["spotify", "Spotify"],
                                                    ["soundcloud", "SoundCloud"],
                                                    ["appleMusic", "Apple Music"],
                                                    ["youtube", "YouTube"],
                                                    ["linktree", "Linktree"],
                                                    ["website", "Website"],
                                                ] as const
                                            ).map(([key, label]) => (
                                                <Controller
                                                    key={key}
                                                    name={`peerifyArtistProfile.musicLinks.${key}` as const}
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextField
                                                            label={label}
                                                            placeholder={`https://${label.toLowerCase().replace(/\s+/g, "")}.com/...`}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                        />
                                                    )}
                                                />
                                            ))}
                                        </div>
                                        <Controller
                                            name="peerifyArtistProfile.featuredLink"
                                            control={form.control}
                                            render={({ field }) => (
                                                <ArtistTextField
                                                    label="Featured link"
                                                    placeholder="https://..."
                                                    description="Optional single call-to-action link for your newest release, press kit, or tour pledge."
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            )}
                                        />
                                    </div>

                                    <Controller
                                        name="peerifyArtistProfile.lookingFor"
                                        control={form.control}
                                        render={({ field }) => (
                                            <CheckboxGroup
                                                label="Looking for / open to"
                                                options={PEERIFY_LOOKING_FOR_OPTIONS}
                                                values={field.value || []}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />

                                    <Controller
                                        name="peerifyArtistProfile.bookingEnabled"
                                        control={form.control}
                                        render={({ field }) => (
                                            <div className="space-y-2 rounded-lg border p-4">
                                                <Label>Booking enquiries</Label>
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(checked) => field.onChange(checked === true)}
                                                    />
                                                    <p className="text-sm text-muted-foreground">
                                                        Show a public booking enquiry flow on this artist profile.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    />

                                    {bookingEnabled ? (
                                        <div className="space-y-6 rounded-lg border bg-slate-50 p-4">
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.localBookingsOnly"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <div className="space-y-2 rounded-lg border bg-white p-4">
                                                            <Label>Local bookings only</Label>
                                                            <div className="flex items-center gap-3">
                                                                <Checkbox
                                                                    checked={field.value}
                                                                    onCheckedChange={(checked) =>
                                                                        field.onChange(checked === true)
                                                                    }
                                                                />
                                                                <p className="text-sm text-muted-foreground">
                                                                    Limit public bookings to local events.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                />
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.travelRadiusKm"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextField
                                                            label="Travel radius (km)"
                                                            type="number"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                        />
                                                    )}
                                                />
                                            </div>

                                            <Controller
                                                name="peerifyArtistProfile.bookingSettings.preferredEventTypes"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <CheckboxGroup
                                                        label="Preferred event types"
                                                        options={PEERIFY_EVENT_TYPE_OPTIONS}
                                                        values={field.value || []}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.minimumAudienceSize"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextField
                                                            label="Minimum audience size"
                                                            type="number"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                        />
                                                    )}
                                                />
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.preferredAudienceSize"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextField
                                                            label="Preferred audience size"
                                                            type="number"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                        />
                                                    )}
                                                />
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.baseFee"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextField
                                                            label="Base fee"
                                                            type="number"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                        />
                                                    )}
                                                />
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.currency"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextField
                                                            label="Currency"
                                                            placeholder="EUR"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                        />
                                                    )}
                                                />
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-3">
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.needsAccommodation"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <label className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm">
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={(checked) =>
                                                                    field.onChange(checked === true)
                                                                }
                                                            />
                                                            <span>Needs accommodation</span>
                                                        </label>
                                                    )}
                                                />
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.needsTransport"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <label className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm">
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={(checked) =>
                                                                    field.onChange(checked === true)
                                                                }
                                                            />
                                                            <span>Needs transport</span>
                                                        </label>
                                                    )}
                                                />
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.needsMeal"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <label className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm">
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={(checked) =>
                                                                    field.onChange(checked === true)
                                                                }
                                                            />
                                                            <span>Needs meal / hospitality</span>
                                                        </label>
                                                    )}
                                                />
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.technicalNeeds"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextareaField
                                                            label="Technical needs"
                                                            placeholder="PA, microphones, backline, monitors..."
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            rows={4}
                                                        />
                                                    )}
                                                />
                                                <Controller
                                                    name="peerifyArtistProfile.bookingSettings.notes"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <ArtistTextareaField
                                                            label="Booking notes"
                                                            placeholder="Anything hosts should know before reaching out."
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            rows={4}
                                                        />
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    ) : null}

                                    <Controller
                                        name="peerifyArtistProfile.availability"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Availability / general booking note"
                                                placeholder="Touring in Scandinavia this autumn, open to house concerts and community spaces."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </>
                            ) : null}
                        </CardContent>
                    </Card>
                ) : null}

                {canEditPeerifyVenueProfile ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Venue Identity</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
                                This managed identity is published as a public Peerify venue.
                            </div>

                            <section className="space-y-4">
                                <h3 className="font-medium">Venue basics</h3>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.venueType"
                                        control={form.control}
                                        render={({ field }) => (
                                            <PeerifySelectField
                                                label="Venue type"
                                                options={VENUE_TYPE_OPTIONS}
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.publicCity"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Public city / area"
                                                placeholder="Stockholm, Sodermalm"
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.address"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Full address"
                                                placeholder="Street address"
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.addressVisibility"
                                        control={form.control}
                                        render={({ field }) => (
                                            <PeerifySelectField
                                                label="Address visibility"
                                                options={ADDRESS_VISIBILITY_OPTIONS}
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <div className="md:col-span-2">
                                        <Controller
                                            name="location"
                                            control={form.control as unknown as Control}
                                            render={({ field }) => (
                                                <DynamicLocationField
                                                    field={{
                                                        name: "location",
                                                        type: "location",
                                                        label: "Map location",
                                                        description:
                                                            "Used to place the venue on the map. The exact address is only shown publicly if address visibility allows it.",
                                                    }}
                                                    formField={field}
                                                    control={form.control as unknown as Control}
                                                />
                                            )}
                                        />
                                    </div>
                                    <Controller
                                        name="peerifyVenueProfile.website"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Website"
                                                placeholder="https://venue.example"
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.instagram"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Instagram"
                                                placeholder="https://instagram.com/venue"
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.contactEmail"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Contact email"
                                                placeholder="booking@venue.example"
                                                type="email"
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-medium">Room & capacity</h3>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <Controller
                                        name="peerifyVenueProfile.capacityStanding"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Standing capacity"
                                                description="Maximum comfortable standing audience."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.capacitySeated"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Seated capacity"
                                                description="Maximum comfortable seated audience."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.typicalShowCapacity"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Typical show capacity"
                                                description="The audience size that usually works best here."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.accessibilityNotes"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Accessibility notes"
                                                description="Step-free access, toilets, seating, sensory considerations, or other access notes."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.agePolicy"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Age policy"
                                                description="Any age restrictions, ID requirements, or family-friendly notes."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-medium">Technical setup</h3>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.paAvailable"
                                        control={form.control}
                                        render={({ field }) => (
                                            <PeerifyCheckboxField
                                                label="PA available"
                                                description="Check if the venue has a usable sound system."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.inHouseEngineer"
                                        control={form.control}
                                        render={({ field }) => (
                                            <PeerifyCheckboxField
                                                label="In-house engineer"
                                                description="Check if someone can run sound during the event."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.backline"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Backline / instruments"
                                                description="List amps, drums, keys, stands, mics, DI boxes, or other gear artists can use."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.lighting"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Lighting"
                                                description="Describe basic stage or room lighting."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.loadInNotes"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Load-in notes"
                                                description="Entrance, stairs, lift access, loading times, or soundcheck notes."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.parkingNotes"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Parking notes"
                                                description="Parking, unloading, or public transport notes."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-medium">Booking terms</h3>
                                <Controller
                                    name="peerifyVenueProfile.bookingEnquiriesEnabled"
                                    control={form.control}
                                    render={({ field }) => (
                                        <PeerifyCheckboxField
                                            label="Booking enquiries enabled"
                                            value={field.value}
                                            onChange={field.onChange}
                                        />
                                    )}
                                />
                                {venueBookingEnabled ? (
                                    <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <Controller
                                                name="peerifyVenueProfile.minimumFee"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <ArtistTextField
                                                        label="Minimum fee"
                                                        description="The minimum amount the venue expects to guarantee or help raise for the artist."
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Controller
                                                name="peerifyVenueProfile.doorSplit"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <ArtistTextField
                                                        label="Door split"
                                                        description="How ticket income is split after agreed costs, e.g. 70/30 artist/venue."
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Controller
                                                name="peerifyVenueProfile.houseCut"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <ArtistTextField
                                                        label="House cut / production fee"
                                                        description="Any fixed venue fee, production cost, or percentage taken before the door split."
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Controller
                                                name="peerifyVenueProfile.peerifyFeeCoveredBy"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <PeerifySelectField
                                                        label="Peerify ticket fee covered by"
                                                        description="Who absorbs the Peerify/platform ticket fee if tickets are sold through Peerify."
                                                        options={PEERIFY_FEE_COVERED_BY_OPTIONS}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Controller
                                                name="peerifyVenueProfile.availableDays"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <ArtistTextField
                                                        label="Available days"
                                                        description="Typical days or times you host shows, e.g. Thursdays, weekends, monthly Sundays."
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Controller
                                                name="peerifyVenueProfile.typicalResponseTime"
                                                control={form.control}
                                                render={({ field }) => (
                                                    <ArtistTextField
                                                        label="Typical response time"
                                                        description="How quickly artists can expect a reply."
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                )}
                                            />
                                        </div>
                                        <Controller
                                            name="peerifyVenueProfile.bookingNote"
                                            control={form.control}
                                            render={({ field }) => (
                                                <ArtistTextareaField
                                                    label="Booking note"
                                                    description="Anything artists should know before sending an enquiry."
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            )}
                                        />
                                    </div>
                                ) : null}
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-medium">Hospitality & support</h3>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.greenRoom"
                                        control={form.control}
                                        render={({ field }) => (
                                            <PeerifyCheckboxField
                                                label="Green room"
                                                description="Private artist room or quiet backstage space."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.merchTable"
                                        control={form.control}
                                        render={({ field }) => (
                                            <PeerifyCheckboxField
                                                label="Merch table"
                                                description="Whether artists can sell merch."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.foodDrink"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Food/drink"
                                                description="What the venue can offer artists and crew."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.accommodationHelp"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Accommodation help"
                                                description="Whether the venue can help arrange a bed, host, hotel discount, or local contact."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.localTransportHelp"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Local transport help"
                                                description="Whether the venue can help with pickup, local rides, or transport advice."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.guestListPolicy"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Guest list policy"
                                                description="How many guest spots are usually available, if any."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-medium">House rules & policies</h3>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <Controller
                                        name="peerifyVenueProfile.houseRules"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="House rules"
                                                description="Important rules artists should know before confirming a show."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.soundCurfew"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextField
                                                label="Sound curfew"
                                                description="When amplified music must stop."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.cancellationPolicy"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Cancellation policy"
                                                description="How cancellations, postponements, or bad weather are handled."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="peerifyVenueProfile.safetyPolicy"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ArtistTextareaField
                                                label="Safety / conduct policy"
                                                description="Audience, artist, harassment, security, or safer-space expectations."
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                            </section>
                        </CardContent>
                    </Card>
                ) : null}

                {renderSaveButton()}

                <Card>
                    <CardHeader>
                        <CardTitle>Visibility</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Controller
                            name="isPublic"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicSwitchField
                                    field={{
                                        name: "isPublic",
                                        type: "switch",
                                        label: "Public",
                                        description: {
                                            circle: "When set to public, users can follow the circle without requiring approval from admins.",
                                            user: "When set to public people can follow you without requiring your approval.",
                                        },
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="showAdminsPublicly"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicSwitchField
                                    field={{
                                        name: "showAdminsPublicly",
                                        type: "switch",
                                        label: "Show admins publicly",
                                        description: {
                                            circle: "Show the Admins panel on your circle home page.",
                                            user: "Show the Admins panel on your circle home page.",
                                        },
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Images</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Controller
                            name="picture"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicImageField
                                    field={{
                                        name: "picture",
                                        type: "image",
                                        label: "Picture",
                                        description: {
                                            circle: "Add a picture to represent the circle.",
                                            user: "Add a profile picture.",
                                        },
                                        imagePreviewWidth: 120,
                                        imagePreviewHeight: 120,
                                        imageMaxSize: ABOUT_IMAGE_UPLOAD_MAX_BYTES,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        {/* Replace Cover Image Field with MultiImageUploader */}
                        <Controller
                            name="images"
                            control={form.control as unknown as Control<FieldValues>}
                            render={({ field }) => (
                                <div>
                                    <Label>Images</Label>
                                    <p className="pb-2 text-[0.8rem] text-muted-foreground">
                                        Add images to showcase and represent your circle. Drag to reorder.
                                    </p>
                                    <MultiImageUploader
                                        initialImages={circle.images || []} // Pass original images
                                        onChange={(items) => {
                                            form.clearErrors("images");
                                            field.onChange(items);
                                        }} // Let the uploader manage state and report changes
                                        maxFileSize={ABOUT_IMAGE_UPLOAD_MAX_BYTES}
                                        maxFileSizeLabel={`${ABOUT_IMAGE_UPLOAD_MAX_MB} MB`}
                                        onValidationError={(message) => {
                                            form.setError("images", { type: "manual", message });
                                            toast({
                                                title: "Image too large",
                                                description: message,
                                                variant: "destructive",
                                            });
                                        }}
                                        enableReordering={true}
                                        maxImages={10} // Example limit
                                        previewMode="compact"
                                    />
                                    {form.formState.errors.images?.message ? (
                                        <p className="text-sm font-medium text-destructive">
                                            {String(form.formState.errors.images.message)}
                                        </p>
                                    ) : null}
                                </div>
                            )}
                        />
                        {/* End of MultiImageUploader */}
                    </CardContent>
                </Card>

                {renderSaveButton()}

                {!canEditPeerifyVenueProfile ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Location</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Controller
                                name="location"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    <DynamicLocationField
                                        field={{
                                            name: "location",
                                            type: "location",
                                            label: "Location",
                                            description: {
                                                circle: "Specify the location of the circle.",
                                                user: "Specify your location. Your location will be shared with other users.",
                                            },
                                        }}
                                        formField={field}
                                        control={form.control as unknown as Control}
                                    />
                                )}
                            />
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>Social Links</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Controller
                            name="socialLinks"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicArrayField
                                    field={{
                                        name: "socialLinks",
                                        type: "array",
                                        label: "Social Links",
                                        itemSchema: {
                                            id: "socialLink",
                                            title: "Social Link",
                                            description: "Add a new social media link.",
                                            button: { text: "Add" },
                                            fields: [
                                                {
                                                    name: "platform",
                                                    label: "Platform",
                                                    type: "select",
                                                    options: socialPlatforms.map((p) => ({
                                                        value: p.handle,
                                                        label: p.name,
                                                    })),
                                                    required: true,
                                                },
                                                { name: "url", label: "URL", type: "text", required: true },
                                            ],
                                        },
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
                    </CardContent>
                </Card>

                {renderSaveButton()}

                <Controller
                    name="_id"
                    control={form.control as unknown as Control}
                    render={({ field }) => (
                        <DynamicField
                            field={{ name: "_id", type: "hidden", label: "ID" }}
                            formField={field}
                            control={form.control as unknown as Control}
                        />
                    )}
                />
            </form>
        </Form>
    );
}

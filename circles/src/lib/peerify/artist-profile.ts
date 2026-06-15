import { Circle } from "@/models/models";

export type PeerifyIdentityType = "artist" | "band" | "dj" | "producer";
export const PEERIFY_MANAGED_IDENTITY_TYPES = ["artist", "band", "dj", "producer"] as const;

export type PeerifyMusicLinkKey =
    | "bandcamp"
    | "spotify"
    | "soundcloud"
    | "appleMusic"
    | "youtube"
    | "linktree"
    | "website";

export type PeerifyArtistProfile = {
    artistTypes: string[];
    baseCity: string;
    genres: string[];
    musicLinks: Partial<Record<PeerifyMusicLinkKey, string>>;
    featuredLink?: string;
    lookingFor: string[];
    bookingEnabled: boolean;
    bookingSettings: {
        localBookingsOnly?: boolean;
        travelRadiusKm?: number;
        preferredEventTypes?: string[];
        minimumAudienceSize?: number;
        preferredAudienceSize?: number;
        baseFee?: number;
        currency?: string;
        needsAccommodation?: boolean;
        needsTransport?: boolean;
        needsMeal?: boolean;
        technicalNeeds?: string;
        notes?: string;
    };
    availability?: string;
};

export type PeerifyMetadata = {
    intent?: string;
    managedIdentity?: boolean;
    identityType?: PeerifyIdentityType;
    artistProfile?: PeerifyArtistProfile;
};

export type PeerifyArtistEnquiryType = "pledge" | "booking";

export type PeerifyPledgeEnquiryInput = {
    fanLocation?: string;
    maximumTicketAmount?: string;
    preferredEventType?: string;
    helpOptions?: string[];
    note?: string;
};

export type PeerifyBookingEnquiryInput = {
    bookerLocation?: string;
    eventType?: string;
    expectedAudienceSize?: string;
    possibleDateRange?: string;
    setting?: string;
    accommodationAvailable?: boolean;
    localTransportAvailable?: boolean;
    foodHospitalityAvailable?: boolean;
    soundEquipmentAvailable?: boolean;
    message?: string;
};

export const PEERIFY_ARTIST_TYPE_OPTIONS = [
    "Solo artist",
    "Band",
    "DJ",
    "Producer",
    "Singer-songwriter",
    "Live electronic",
    "Acoustic act",
    "Collective",
] as const;

export const PEERIFY_MANAGED_IDENTITY_TYPE_OPTIONS: ReadonlyArray<{
    value: PeerifyIdentityType;
    label: string;
    description: string;
}> = [
    {
        value: "artist",
        label: "Artist / Solo Project",
        description: "A public identity for a solo act or personal music project.",
    },
    {
        value: "band",
        label: "Band",
        description: "A public identity for a band or group.",
    },
    {
        value: "dj",
        label: "DJ",
        description: "A public identity for a DJ project.",
    },
    {
        value: "producer",
        label: "Producer",
        description: "A public identity for a producer or beatmaker project.",
    },
] as const;

export const PEERIFY_MANAGED_IDENTITY_TYPE_LABELS: Record<PeerifyIdentityType, string> = {
    artist: "Artist / Solo Project",
    band: "Band",
    dj: "DJ",
    producer: "Producer",
};

export const PEERIFY_LOOKING_FOR_OPTIONS = [
    "Shows",
    "House concerts",
    "Festivals",
    "Collaborators",
    "Promoters",
    "Hosts",
    "Fans",
    "Press",
] as const;

export const PEERIFY_EVENT_TYPE_OPTIONS = [
    "House concert",
    "Listening room",
    "Club show",
    "Festival",
    "Private event",
    "Community event",
    "Support slot",
    "Workshop",
] as const;

export const PEERIFY_PLEDGE_HELP_OPTIONS = [
    "Attend",
    "Promote",
    "Maybe host",
    "Space for 20-30 people",
    "Local transport",
    "Spare room",
    "Food / hospitality",
    "Sound / equipment",
] as const;

export const PEERIFY_BOOKING_SUPPORT_OPTIONS = [
    "Accommodation available",
    "Local transport available",
    "Food / hospitality available",
    "Sound equipment available",
] as const;

export const PEERIFY_MUSIC_LINK_LABELS: Record<PeerifyMusicLinkKey, string> = {
    bandcamp: "Bandcamp",
    spotify: "Spotify",
    soundcloud: "SoundCloud",
    appleMusic: "Apple Music",
    youtube: "YouTube",
    linktree: "Linktree",
    website: "Website",
};

const DEFAULT_ARTIST_PROFILE: PeerifyArtistProfile = {
    artistTypes: [],
    baseCity: "",
    genres: [],
    musicLinks: {},
    featuredLink: "",
    lookingFor: [],
    bookingEnabled: false,
    bookingSettings: {},
    availability: "",
};

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeExternalUrl = (value: unknown): string => {
    const nextValue = asString(value);
    if (!nextValue) {
        return "";
    }

    if (/^https?:\/\//i.test(nextValue)) {
        return nextValue;
    }

    return `https://${nextValue}`;
};

const asStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => asString(item))
        .filter(Boolean);
};

const asOptionalNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
};

const asOptionalBoolean = (value: unknown): boolean | undefined =>
    typeof value === "boolean" ? value : undefined;

const normalizeMusicLinks = (value: unknown): Partial<Record<PeerifyMusicLinkKey, string>> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const input = value as Record<string, unknown>;
    const result: Partial<Record<PeerifyMusicLinkKey, string>> = {};

    (Object.keys(PEERIFY_MUSIC_LINK_LABELS) as PeerifyMusicLinkKey[]).forEach((key) => {
        const nextValue = normalizeExternalUrl(input[key]);
        if (nextValue) {
            result[key] = nextValue;
        }
    });

    return result;
};

export const normalizePeerifyArtistProfile = (value: unknown): PeerifyArtistProfile => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ...DEFAULT_ARTIST_PROFILE, bookingSettings: {}, musicLinks: {} };
    }

    const input = value as Record<string, unknown>;

    return {
        artistTypes: asStringArray(input.artistTypes),
        baseCity: asString(input.baseCity),
        genres: asStringArray(input.genres),
        musicLinks: normalizeMusicLinks(input.musicLinks),
        featuredLink: normalizeExternalUrl(input.featuredLink),
        lookingFor: asStringArray(input.lookingFor),
        bookingEnabled: input.bookingEnabled === true,
        bookingSettings: {
            localBookingsOnly: asOptionalBoolean((input.bookingSettings as Record<string, unknown> | undefined)?.localBookingsOnly),
            travelRadiusKm: asOptionalNumber((input.bookingSettings as Record<string, unknown> | undefined)?.travelRadiusKm),
            preferredEventTypes: asStringArray((input.bookingSettings as Record<string, unknown> | undefined)?.preferredEventTypes),
            minimumAudienceSize: asOptionalNumber((input.bookingSettings as Record<string, unknown> | undefined)?.minimumAudienceSize),
            preferredAudienceSize: asOptionalNumber((input.bookingSettings as Record<string, unknown> | undefined)?.preferredAudienceSize),
            baseFee: asOptionalNumber((input.bookingSettings as Record<string, unknown> | undefined)?.baseFee),
            currency: asString((input.bookingSettings as Record<string, unknown> | undefined)?.currency),
            needsAccommodation: asOptionalBoolean((input.bookingSettings as Record<string, unknown> | undefined)?.needsAccommodation),
            needsTransport: asOptionalBoolean((input.bookingSettings as Record<string, unknown> | undefined)?.needsTransport),
            needsMeal: asOptionalBoolean((input.bookingSettings as Record<string, unknown> | undefined)?.needsMeal),
            technicalNeeds: asString((input.bookingSettings as Record<string, unknown> | undefined)?.technicalNeeds),
            notes: asString((input.bookingSettings as Record<string, unknown> | undefined)?.notes),
        },
        availability: asString(input.availability),
    };
};

export const getPeerifyMetadata = (circle?: Partial<Circle> | null): PeerifyMetadata => {
    const peerify = (circle?.metadata as Record<string, unknown> | undefined)?.peerify;
    if (!peerify || typeof peerify !== "object" || Array.isArray(peerify)) {
        return {};
    }

    const input = peerify as Record<string, unknown>;

    return {
        intent: asString(input.intent) || undefined,
        managedIdentity: input.managedIdentity === true,
        identityType: PEERIFY_MANAGED_IDENTITY_TYPES.includes(asString(input.identityType) as PeerifyIdentityType)
            ? (asString(input.identityType) as PeerifyIdentityType)
            : undefined,
        artistProfile: normalizePeerifyArtistProfile(input.artistProfile),
    };
};

export const getPeerifyArtistProfile = (circle?: Partial<Circle> | null): PeerifyArtistProfile =>
    getPeerifyMetadata(circle).artistProfile ?? { ...DEFAULT_ARTIST_PROFILE, bookingSettings: {}, musicLinks: {} };

export const hasPeerifyArtistIntent = (circle?: Partial<Circle> | null): boolean => {
    const peerifyMetadata = getPeerifyMetadata(circle);
    return peerifyMetadata.intent === "artist";
};

export const isPeerifyManagedIdentity = (circle?: Partial<Circle> | null): boolean =>
    getPeerifyMetadata(circle).managedIdentity === true;

export const getPeerifyIdentityType = (circle?: Partial<Circle> | null): PeerifyIdentityType | undefined =>
    getPeerifyMetadata(circle).identityType;

export const isPeerifyArtistIdentity = (circle?: Partial<Circle> | null): boolean => {
    if (hasPeerifyArtistIntent(circle)) {
        return true;
    }

    const peerifyMetadata = getPeerifyMetadata(circle);
    return (
        peerifyMetadata.managedIdentity === true &&
        typeof peerifyMetadata.identityType === "string" &&
        PEERIFY_MANAGED_IDENTITY_TYPES.includes(peerifyMetadata.identityType as PeerifyIdentityType)
    );
};

export const getPeerifyArtistIdentityLabel = (circle?: Partial<Circle> | null): string => {
    const identityType = getPeerifyIdentityType(circle);
    return identityType ? PEERIFY_MANAGED_IDENTITY_TYPE_LABELS[identityType] : "Artist";
};

export const getPeerifyArtistTypeBadges = (circle?: Partial<Circle> | null): string[] => {
    const artistTypes = getPeerifyArtistProfile(circle).artistTypes;
    if (artistTypes.length > 0) {
        return artistTypes;
    }

    const identityType = getPeerifyIdentityType(circle);
    return identityType ? [PEERIFY_MANAGED_IDENTITY_TYPE_LABELS[identityType]] : [];
};

export const hasPeerifyArtistProfileContent = (profile: PeerifyArtistProfile): boolean =>
    profile.artistTypes.length > 0 ||
    profile.genres.length > 0 ||
    Boolean(profile.baseCity) ||
    Object.keys(profile.musicLinks).length > 0 ||
    Boolean(profile.featuredLink) ||
    profile.lookingFor.length > 0 ||
    profile.bookingEnabled ||
    Boolean(profile.availability);

const formatArtistName = (circle?: Partial<Circle> | null): string => asString(circle?.name) || "Unknown artist";

const formatBulletLines = (items: string[]): string =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None specified";

const withFallback = (value: string | undefined, fallback = "Not specified"): string => {
    const nextValue = asString(value);
    return nextValue || fallback;
};

export const formatPeerifyPledgeEnquiryMessage = (
    circle: Partial<Circle> | null | undefined,
    enquiry: PeerifyPledgeEnquiryInput,
): string => {
    const helpOptions = asStringArray(enquiry.helpOptions);
    return [
        "Peerify pledge enquiry",
        "",
        "This is a non-binding pledge of interest, not a ticket purchase.",
        "",
        `Artist: ${formatArtistName(circle)}`,
        `Fan location: ${withFallback(enquiry.fanLocation)}`,
        `Maximum ticket amount: ${withFallback(enquiry.maximumTicketAmount)}`,
        `Preferred event type: ${withFallback(enquiry.preferredEventType)}`,
        "Can help with:",
        formatBulletLines(helpOptions),
        "",
        `Note: ${withFallback(enquiry.note, "None")}`,
    ].join("\n");
};

export const formatPeerifyBookingEnquiryMessage = (
    circle: Partial<Circle> | null | undefined,
    enquiry: PeerifyBookingEnquiryInput,
): string => {
    const supportLines = [
        `Accommodation: ${enquiry.accommodationAvailable ? "yes" : "no"}`,
        `Local transport: ${enquiry.localTransportAvailable ? "yes" : "no"}`,
        `Food / hospitality: ${enquiry.foodHospitalityAvailable ? "yes" : "no"}`,
        `Sound equipment: ${enquiry.soundEquipmentAvailable ? "yes" : "no"}`,
    ];

    return [
        "Peerify booking enquiry",
        "",
        "This is a booking enquiry only. It is not a confirmed booking or agreement.",
        "",
        `Artist: ${formatArtistName(circle)}`,
        `Booker location: ${withFallback(enquiry.bookerLocation)}`,
        `Event type: ${withFallback(enquiry.eventType)}`,
        `Expected audience size: ${withFallback(enquiry.expectedAudienceSize)}`,
        `Possible date/date range: ${withFallback(enquiry.possibleDateRange)}`,
        `Setting: ${withFallback(enquiry.setting)}`,
        "",
        "Available support:",
        formatBulletLines(supportLines),
        "",
        `Message: ${withFallback(enquiry.message, "None")}`,
    ].join("\n");
};

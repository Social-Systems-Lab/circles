import { Circle } from "@/models/models";

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
    artistProfile?: PeerifyArtistProfile;
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
        artistProfile: normalizePeerifyArtistProfile(input.artistProfile),
    };
};

export const getPeerifyArtistProfile = (circle?: Partial<Circle> | null): PeerifyArtistProfile =>
    getPeerifyMetadata(circle).artistProfile ?? { ...DEFAULT_ARTIST_PROFILE, bookingSettings: {}, musicLinks: {} };

export const hasPeerifyArtistIntent = (circle?: Partial<Circle> | null): boolean => {
    const peerifyMetadata = getPeerifyMetadata(circle);
    return peerifyMetadata.intent === "artist";
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

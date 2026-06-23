import type {
    EventDisplay,
    PeerifyEventAccessMode,
    PeerifyEventLocationDisclosure,
    PeerifyEventVenueDisclosure,
} from "@/models/models";

type DisclosureBadge = {
    key: string;
    label: string;
};

type PeerifyEventDisclosureDisplay = {
    venueLabel?: string;
    locationLabel?: string;
    accessLabel?: string;
    publicLocationLabel?: string;
    detailBadges: DisclosureBadge[];
    cardBadges: DisclosureBadge[];
    isExactPublicLocation: boolean;
};

const VENUE_LABELS: Record<PeerifyEventVenueDisclosure, { detail?: string; card?: string }> = {
    public: {},
    venue_to_be_disclosed: { detail: "Venue to be announced", card: "Venue TBA" },
    secret_after_acceptance: { detail: "Venue hidden until accepted", card: "Venue hidden" },
    one_off_location: { detail: "One-off location", card: "One-off location" },
};

const LOCATION_LABELS: Record<PeerifyEventLocationDisclosure, { detail?: string; card?: string }> = {
    public: {},
    approximate: { detail: "Approximate area", card: "Approximate area" },
    secret_after_acceptance: { detail: "Address revealed after acceptance", card: "Address after acceptance" },
    to_be_disclosed: { detail: "Address to be announced", card: "Address TBA" },
};

const ACCESS_LABELS: Record<PeerifyEventAccessMode, { detail?: string; card?: string }> = {
    open_rsvp: { detail: "Open RSVP" },
    approval_required: { detail: "Approval required", card: "Approval required" },
    ticket_required: { detail: "Ticket required", card: "Ticket required" },
    invite_only: { detail: "Invite only", card: "Invite only" },
};

function getPeerifyMetadata(event: EventDisplay) {
    const peerify = event.metadata?.peerify;
    if (!peerify || typeof peerify !== "object" || Array.isArray(peerify)) {
        return {};
    }
    return peerify;
}

function sameNormalizedText(a?: string, b?: string) {
    return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function getLocationText(event: EventDisplay) {
    if (event.isVirtual) return "Online";
    const location = event.location;
    if (!location) return undefined;
    return [location.street, location.city, location.region, location.country].filter(Boolean).join(", ") || undefined;
}

export function getPeerifySafeEventLocationText(event: EventDisplay): string | undefined {
    if (event.isVirtual) return "Online";
    const peerify = getPeerifyMetadata(event);
    const locationDisclosure = (peerify.locationDisclosure ?? "public") as PeerifyEventLocationDisclosure;
    const location = event.location;
    if (!location) return undefined;

    if (locationDisclosure === "public") {
        return (
            [location.street, location.city, location.region, location.country].filter(Boolean).join(", ") || undefined
        );
    }

    const publicLocationLabel =
        typeof peerify.publicLocationLabel === "string" ? peerify.publicLocationLabel.trim() : "";
    if (publicLocationLabel) {
        return publicLocationLabel;
    }

    return [location.city, location.region, location.country].filter(Boolean).join(", ") || undefined;
}

export function getPeerifyEventDisclosureDisplay(event: EventDisplay): PeerifyEventDisclosureDisplay {
    const peerify = getPeerifyMetadata(event);
    const venueDisclosure = (peerify.venueDisclosure ?? "public") as PeerifyEventVenueDisclosure;
    const locationDisclosure = (peerify.locationDisclosure ?? "public") as PeerifyEventLocationDisclosure;
    const accessMode = (peerify.accessMode ?? "open_rsvp") as PeerifyEventAccessMode;
    const venue = VENUE_LABELS[venueDisclosure] ?? VENUE_LABELS.public;
    const location = LOCATION_LABELS[locationDisclosure] ?? LOCATION_LABELS.public;
    const access = ACCESS_LABELS[accessMode] ?? ACCESS_LABELS.open_rsvp;
    const rawPublicLocationLabel =
        typeof peerify.publicLocationLabel === "string" ? peerify.publicLocationLabel.trim() : "";
    const existingLocationText = getLocationText(event);
    const publicLocationLabel =
        rawPublicLocationLabel &&
        locationDisclosure !== "public" &&
        !sameNormalizedText(rawPublicLocationLabel, existingLocationText)
            ? rawPublicLocationLabel
            : undefined;

    const detailBadges = [
        venue.detail ? { key: "venue", label: venue.detail } : undefined,
        location.detail ? { key: "location", label: location.detail } : undefined,
        accessMode !== "open_rsvp" && access.detail ? { key: "access", label: access.detail } : undefined,
    ].filter(Boolean) as DisclosureBadge[];

    const cardBadges = [
        venue.card ? { key: "venue", label: venue.card } : undefined,
        location.card ? { key: "location", label: location.card } : undefined,
        access.card ? { key: "access", label: access.card } : undefined,
    ].filter(Boolean) as DisclosureBadge[];

    return {
        venueLabel: venue.detail,
        locationLabel: location.detail,
        accessLabel: access.detail,
        publicLocationLabel,
        detailBadges,
        cardBadges,
        isExactPublicLocation: venueDisclosure === "public" && locationDisclosure === "public",
    };
}

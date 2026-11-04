import { locationSchema, type Location } from "@/models/models";

const LOCATION_FIELDS = ["precision", "country", "region", "city", "street"] as const;

export const projectPublicLocation = (value: unknown): Location | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const precision = source.precision;
    if (typeof precision !== "number" || !Number.isInteger(precision) || precision < 0 || precision > 4) {
        return undefined;
    }

    const location: Location = { precision };
    if (typeof source.country === "string") location.country = source.country;
    if (precision >= 1 && typeof source.region === "string") location.region = source.region;
    if (precision >= 2 && typeof source.city === "string") location.city = source.city;
    if (precision >= 3 && typeof source.street === "string") location.street = source.street;
    if (precision === 4 && source.lngLat && typeof source.lngLat === "object") {
        const lngLat = source.lngLat as Record<string, unknown>;
        if (
            typeof lngLat.lng === "number" &&
            Number.isFinite(lngLat.lng) &&
            typeof lngLat.lat === "number" &&
            Number.isFinite(lngLat.lat)
        ) {
            location.lngLat = { lng: lngLat.lng, lat: lngLat.lat };
        }
    }
    return location;
};

const locationsEqual = (left?: Location | null, right?: Location | null): boolean => {
    if (!left || !right) return left == null && right == null;
    return (
        LOCATION_FIELDS.every((field) => left[field] === right[field]) &&
        left.lngLat?.lng === right.lngLat?.lng &&
        left.lngLat?.lat === right.lngLat?.lat
    );
};

export type PersonalLocationSaveResult = { valid: true; location?: Location } | { valid: false };

/** Preserve an existing personal location unless a member explicitly selects or clears a pin. */
export const preparePersonalLocationForSave = (
    value: unknown,
    existing?: Location | null,
): PersonalLocationSaveResult => {
    if (value === undefined || value === null) return { valid: true, location: existing ?? undefined };
    if (typeof value !== "object" || Array.isArray(value)) return { valid: false };

    const source = value as Record<string, unknown>;
    const hasCoordinates = source.lngLat !== undefined && source.lngLat !== null;
    if (!hasCoordinates && source.precision === undefined && Object.keys(source).length === 0) {
        return { valid: true, location: existing ?? undefined };
    }

    const parsed = locationSchema.safeParse(value);
    if (!parsed.success) return { valid: false };
    const candidate = parsed.data;

    if (locationsEqual(existing, candidate)) return { valid: true, location: existing ?? undefined };
    if (!candidate.lngLat) return { valid: true, location: candidate };

    const { lng, lat } = candidate.lngLat;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        return { valid: false };
    }

    return { valid: true, location: { ...candidate, precision: 4 } };
};

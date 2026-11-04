import {
    COMMUNITY_GUIDELINE_RULE_IDS,
    isAcceptedCommunityGuidelineRule,
    normalizeCommunityGuidelineAgreementState,
    type CommunityGuidelineAgreementState,
} from "@/lib/community-guidelines";
import { locationSchema, type Location } from "@/models/models";

export const normalizeOnboardingIntroduction = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

export const validateOnboardingLocation = (value: unknown): Location | null => {
    const parsed = locationSchema.safeParse(value);
    if (!parsed.success) return null;
    const { precision, lngLat } = parsed.data;
    if (!Number.isInteger(precision) || precision < 0 || precision > 4 || !lngLat) return null;
    if (
        !Number.isFinite(lngLat.lng) ||
        lngLat.lng < -180 ||
        lngLat.lng > 180 ||
        !Number.isFinite(lngLat.lat) ||
        lngLat.lat < -90 ||
        lngLat.lat > 90
    ) {
        return null;
    }
    return parsed.data;
};

export const acceptMissingCommunityGuidelines = (
    current?: Parameters<typeof normalizeCommunityGuidelineAgreementState>[0],
    acceptedAt = new Date(),
): CommunityGuidelineAgreementState => {
    const next = normalizeCommunityGuidelineAgreementState(current);
    for (const ruleId of COMMUNITY_GUIDELINE_RULE_IDS) {
        if (!isAcceptedCommunityGuidelineRule(next[ruleId])) {
            next[ruleId] = { accepted: true, acceptedAt };
        }
    }
    return next;
};

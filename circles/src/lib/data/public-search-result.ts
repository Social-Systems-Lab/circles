import {
    engagementSchema,
    fileInfoSchema,
    mediaSchema,
    needsSchema,
    offersSchema,
    socialLinkSchema,
    type Circle,
    type FileInfo,
    type Location,
    type Media,
    type SocialLink,
    type WithMetric,
} from "@/models/models";

export const PUBLIC_SEARCH_CIRCLE_PROJECTION = {
    _id: 1,
    did: 1,
    name: 1,
    handle: 1,
    picture: 1,
    images: 1,
    description: 1,
    content: 1,
    mission: 1,
    isPublic: 1,
    isVerified: 1,
    verificationStatus: 1,
    isMember: 1,
    accountStatus: 1,
    isFoundingMember: 1,
    foundingMemberNumber: 1,
    members: 1,
    createdAt: 1,
    circleType: 1,
    publishStatus: 1,
    moderationStatus: 1,
    visibility: 1,
    interests: 1,
    location: 1,
    causes: 1,
    skills: 1,
    offers: 1,
    engagements: 1,
    needs: 1,
    socialLinks: 1,
    websiteUrl: 1,
    representsOrganization: 1,
    organizationName: 1,
} as const;

const copyStringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;

const copyFileInfo = (value: unknown): FileInfo | undefined => {
    const parsed = fileInfoSchema.safeParse(value);
    if (!parsed.success) return undefined;

    return {
        ...(parsed.data.originalName !== undefined ? { originalName: parsed.data.originalName } : {}),
        ...(parsed.data.fileName !== undefined ? { fileName: parsed.data.fileName } : {}),
        url: parsed.data.url,
    };
};

const copyMedia = (value: unknown): Media[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    const media = value.flatMap((item) => {
        const parsed = mediaSchema.safeParse(item);
        if (!parsed.success) return [];
        return [{ name: parsed.data.name, type: parsed.data.type, fileInfo: copyFileInfo(parsed.data.fileInfo)! }];
    });

    return media.length > 0 ? media : undefined;
};

const copySocialLinks = (value: unknown): SocialLink[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    const links = value.flatMap((item) => {
        const parsed = socialLinkSchema.safeParse(item);
        if (!parsed.success) return [];
        return [{ platform: parsed.data.platform, url: parsed.data.url }];
    });

    return links.length > 0 ? links : undefined;
};

export const buildPublicSearchLocation = (value: unknown): Location | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const precision = source.precision;
    if (!Number.isInteger(precision) || typeof precision !== "number" || precision < 0 || precision > 4) {
        return undefined;
    }

    const location: Location = { precision };
    if (typeof source.country === "string") location.country = source.country;
    if (precision >= 1 && typeof source.region === "string") location.region = source.region;
    if (precision >= 2 && typeof source.city === "string") location.city = source.city;
    if (precision >= 3 && typeof source.street === "string") location.street = source.street;
    if (precision === 4 && source.lngLat && typeof source.lngLat === "object") {
        const lngLat = source.lngLat as Record<string, unknown>;
        if (Number.isFinite(lngLat.lng) && Number.isFinite(lngLat.lat)) {
            location.lngLat = { lng: lngLat.lng as number, lat: lngLat.lat as number };
        }
    }

    return location;
};

const copyPublicOffers = (value: unknown): Circle["offers"] => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    if (source.visibility !== "public") return undefined;
    const parsed = offersSchema.safeParse(value);
    if (!parsed.success) return undefined;

    return {
        ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
        ...(parsed.data.skills ? { skills: [...parsed.data.skills] } : {}),
        visibility: "public",
    };
};

const copyPublicEngagements = (value: unknown): Circle["engagements"] => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    if (source.visibility !== "public") return undefined;
    const parsed = engagementSchema.safeParse(value);
    if (!parsed.success) return undefined;

    return {
        ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
        ...(parsed.data.interests ? { interests: [...parsed.data.interests] } : {}),
        visibility: "public",
        inviteEnabled: parsed.data.inviteEnabled,
    };
};

const copyPublicNeeds = (value: unknown): Circle["needs"] => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    if (source.visibility !== "public") return undefined;
    const parsed = needsSchema.safeParse(value);
    if (!parsed.success) return undefined;

    return {
        ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
        ...(parsed.data.tags ? { tags: [...parsed.data.tags] } : {}),
        visibility: "public",
        offerHelpEnabled: parsed.data.offerHelpEnabled,
    };
};

export const buildPublicSearchableCircle = (circle: Circle): Circle => ({
    ...circle,
    location: buildPublicSearchLocation(circle.location),
    offers: copyPublicOffers(circle.offers),
    engagements: copyPublicEngagements(circle.engagements),
    needs: copyPublicNeeds(circle.needs),
});

export const buildPublicSearchResult = (circle: Circle, searchRank: number): WithMetric<Circle> => {
    const location = buildPublicSearchLocation(circle.location);
    const picture = copyFileInfo(circle.picture);
    const images = copyMedia(circle.images);
    const interests = copyStringArray(circle.interests);
    const causes = copyStringArray(circle.causes);
    const skills = copyStringArray(circle.skills);
    const offers = copyPublicOffers(circle.offers);
    const engagements = copyPublicEngagements(circle.engagements);
    const needs = copyPublicNeeds(circle.needs);
    const socialLinks = copySocialLinks(circle.socialLinks);

    return {
        ...(circle._id !== undefined ? { _id: circle._id } : {}),
        ...(typeof circle.did === "string" ? { did: circle.did } : {}),
        ...(typeof circle.name === "string" ? { name: circle.name } : {}),
        ...(typeof circle.handle === "string" ? { handle: circle.handle } : {}),
        ...(picture ? { picture } : {}),
        ...(images ? { images } : {}),
        ...(typeof circle.description === "string" ? { description: circle.description } : {}),
        ...(typeof circle.content === "string" ? { content: circle.content } : {}),
        ...(typeof circle.mission === "string" ? { mission: circle.mission } : {}),
        ...(typeof circle.isPublic === "boolean" ? { isPublic: circle.isPublic } : {}),
        ...(typeof circle.isVerified === "boolean" ? { isVerified: circle.isVerified } : {}),
        ...(circle.verificationStatus ? { verificationStatus: circle.verificationStatus } : {}),
        ...(typeof circle.isMember === "boolean" ? { isMember: circle.isMember } : {}),
        ...(typeof circle.isFoundingMember === "boolean" ? { isFoundingMember: circle.isFoundingMember } : {}),
        ...(typeof circle.foundingMemberNumber === "number"
            ? { foundingMemberNumber: circle.foundingMemberNumber }
            : {}),
        ...(typeof circle.members === "number" ? { members: circle.members } : {}),
        ...(circle.createdAt instanceof Date ? { createdAt: circle.createdAt } : {}),
        ...(circle.circleType ? { circleType: circle.circleType } : {}),
        ...(circle.visibility ? { visibility: circle.visibility } : {}),
        ...(interests ? { interests } : {}),
        ...(location ? { location } : {}),
        ...(causes ? { causes } : {}),
        ...(skills ? { skills } : {}),
        ...(offers ? { offers } : {}),
        ...(engagements ? { engagements } : {}),
        ...(needs ? { needs } : {}),
        ...(socialLinks ? { socialLinks } : {}),
        ...(typeof circle.websiteUrl === "string" ? { websiteUrl: circle.websiteUrl } : {}),
        ...(typeof circle.representsOrganization === "boolean"
            ? { representsOrganization: circle.representsOrganization }
            : {}),
        ...(typeof circle.organizationName === "string" ? { organizationName: circle.organizationName } : {}),
        metrics: { searchRank, similarity: searchRank },
    } as WithMetric<Circle>;
};

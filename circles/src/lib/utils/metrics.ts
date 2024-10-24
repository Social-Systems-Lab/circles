import { Circle, LngLat, MemberDisplay, Metrics, Post, PostDisplay, SortingOptions, Weights } from "@/models/models";
import { getVbdSimilarity } from "../data/vdb";

const defaultWeights: Weights = {
    vibe: 0.25,
    proximity: 0.25,
    recentness: 0.25,
    popularity: 0.25,
};

const getWeightsBySortingOptions = (sortingOptions?: SortingOptions, customWeights?: Weights): Weights => {
    switch (sortingOptions) {
        case "vibe":
            return { vibe: 1, proximity: 0, recentness: 0, popularity: 0 };
        case "near":
            return { vibe: 0, proximity: 1, recentness: 0, popularity: 0 };
        case "new":
            return { vibe: 0, proximity: 0, recentness: 1, popularity: 0 };
        case "pop":
            return { vibe: 0, proximity: 0, recentness: 0, popularity: 1 };
        case "custom":
            return customWeights ?? defaultWeights;
        default:
            return defaultWeights;
    }
};

const postPopularityWeights = {
    like: 1, // how much like is worth
    comment: 2, // how much a comment is worth
};

const maxPostPopularity = 1000; // for normalization of popularity
const maxCirclePopularity = 1000; // for normalization of popularity

export const getMetrics = async (
    user: Circle | undefined,
    item: PostDisplay | Circle | MemberDisplay,
    currentDate: Date,
    sortingOptions?: SortingOptions,
    customWeights?: Weights,
): Promise<Metrics> => {
    let weights = getWeightsBySortingOptions(sortingOptions);
    let metrics: Metrics = {};

    if (user) {
        metrics.vibe = await getVibe(user, item);
        metrics.distance = calculateDistance(user.location?.lngLat, item.location?.lngLat);
        metrics.proximity = getProximity(user.location?.lngLat, item.location?.lngLat);
    }
    metrics.recentness = getRecentness(getCreatedAt(item), currentDate);
    metrics.popularity = getPopularity(item);
    metrics.rank = getRank(metrics, weights);

    return metrics;
};

export const getCreatedAt = (item: PostDisplay | Circle | MemberDisplay): Date | undefined => {
    if ("joinedAt" in item) {
        return item.joinedAt;
    } else if ("createdAt" in item) {
        return item.createdAt;
    }
};

export const normalizeCosineSimilarity = (cosineSimilarity: number): number => {
    return (cosineSimilarity + 1) / 2;
};

export const getRank = (metrics: Metrics, customWeights?: Weights): number => {
    let weights = customWeights ?? defaultWeights;
    return (
        1 -
        ((metrics.vibe !== undefined ? metrics.vibe : 0.5) * weights.vibe +
            (metrics.proximity !== undefined ? metrics.proximity : 0.5) * weights.proximity +
            (metrics.recentness !== undefined ? metrics.recentness : 0) * weights.recentness +
            (metrics.popularity !== undefined ? metrics.popularity : 0) * weights.popularity)
    );
};

export const getVibe = async (
    user: Circle,
    item: PostDisplay | Circle | MemberDisplay,
): Promise<number | undefined> => {
    if (!user) return undefined;
    console.log("getVibe", user.handle, item.circleType, item.handle ?? item._id);
    let similarity = await getVbdSimilarity(user, item);
    console.log("similarity", similarity);

    return similarity ? normalizeCosineSimilarity(similarity) : similarity; // vibe between 0 and 1
};

export const getRecentness = (createdAt: Date | undefined, currentDate: Date): number | undefined => {
    if (!createdAt) {
        return undefined;
    }

    const daysSinceCreation = (currentDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return 1 / (1 + daysSinceCreation);
};

export const getProximity = (lngLat1?: LngLat, lngLat2?: LngLat): number | undefined => {
    let distance = calculateDistance(lngLat1, lngLat2);
    if (distance === undefined) {
        return undefined;
    }

    return 1 - distance / 20000; // max distance on earth is about 20000 km
};

export const getPopularity = (item: PostDisplay | Circle | MemberDisplay) => {
    let isCircle = item?.circleType === "circle" || item?.circleType === "user";
    if (isCircle) {
        return getCirclePopularity(item as Circle);
    } else {
        return getPostPopularity(item as PostDisplay);
    }
};

export const getPostPopularity = (post: PostDisplay): number | undefined => {
    let totalReactions = 0;
    for (const reactionCount of Object.values(post.reactions)) {
        totalReactions += reactionCount;
    }
    let popularityScore = totalReactions * postPopularityWeights.like + post.comments * postPopularityWeights.comment;

    // Apply a logarithmic scale to popularity and normalize it
    return Math.log10(popularityScore + 1) / Math.log10(maxPostPopularity + 1);
};

export const getCirclePopularity = (circle: Circle): number | undefined => {
    let popularityScore = circle.members ?? 0;
    return Math.log10(popularityScore + 1) / Math.log10(maxCirclePopularity + 1);
};

export const calculateDistance = (lngLat1?: LngLat, lngLat2?: LngLat): number | undefined => {
    if (lngLat1 === undefined || lngLat2 === undefined) {
        return undefined;
    }

    const lat1 = lngLat1.lat;
    const lon1 = lngLat1.lng;
    const lat2 = lngLat2.lat;
    const lon2 = lngLat2.lng;

    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
};

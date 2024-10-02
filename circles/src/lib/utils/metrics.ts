import { Circle, LngLat, Metrics, Post, Weights } from "@/models/models";
import { getVibeForCircleWeaviate, getVibeForItemWeaviate, getVibeForPostWeaviate } from "../data/weaviate";
import { custom } from "zod";

const defaultWeights = {
    vibe: 0.25,
    proximity: 0.25,
    recentness: 0.25,
    popularity: 0.25,
};

const postPopularityWeights = {
    like: 1,
    comment: 2,
};

export const getMetrics = async (
    user: Circle,
    item: Post | Circle,
    currentDate: Date,
    customWeights?: Weights,
): Promise<Metrics> => {
    let weights = customWeights ?? defaultWeights;
    let metrics: Metrics = {};

    metrics.vibe = await getVibe(user, item);
    metrics.proximity = getDistance(user.location?.lngLat, item.location?.lngLat);
    metrics.recentness = getRecentness(item.createdAt, currentDate);
    metrics.popularity = getPopularity(item);

    return metrics;
};

export const getVibe = async (user: Circle, item: Post | Circle): Promise<number | undefined> => {
    if (!user) return undefined;
    return await getVibeForItemWeaviate(user, item);
};

export const getRecentness = (createdAt: Date | undefined, currentDate: Date): number | undefined => {
    if (!createdAt) {
        return undefined;
    }

    const daysSinceCreation = (currentDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return 1 / (1 + daysSinceCreation);
};

export const getDistance = (lngLat1?: LngLat, lngLat2?: LngLat): number | undefined => {
    if (!lngLat1 || !lngLat2) {
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

export const getPopularity = (item: Post | Circle) => {
    if ("circleType" in item) {
        return getCirclePopularity(item as Circle);
    } else {
        return getPostPopularity(item as Post);
    }
};

export const getPostPopularity = (post: Post): number | undefined => {
    let totalReactions = 0;
    for (const reactionCount of Object.values(post.reactions)) {
        totalReactions += reactionCount;
    }
    return totalReactions * postPopularityWeights.like + post.comments * postPopularityWeights.comment;
};

export const getCirclePopularity = (circle: Circle): number | undefined => {
    return circle.members;
};

export const getRank = (metrics: Metrics, customWeights?: Weights): number => {
    let weights = customWeights ?? defaultWeights;
    return (
        (metrics.vibe ?? 0) * weights.vibe +
        (metrics.proximity ?? 0) * weights.proximity +
        (metrics.recentness ?? 0) * weights.recentness +
        (metrics.popularity ?? 0) * weights.popularity
    );
};

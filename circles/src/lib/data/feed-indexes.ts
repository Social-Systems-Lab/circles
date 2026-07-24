import type { CreateIndexesOptions, IndexSpecification } from "mongodb";

export const COMMUNITY_FEED_UNIQUE_INDEX_KEYS = {
    circleId: 1,
    handle: 1,
} as const satisfies IndexSpecification;

export const COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS: CreateIndexesOptions = {
    name: "unique_community_feed_per_circle",
    unique: true,
    partialFilterExpression: { handle: "community" },
};

export const isDuplicateKeyError = (error: unknown): boolean => {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === 11000
    );
};

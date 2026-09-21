import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Circle, LngLat, MemberDisplay, Metrics, PostDisplay } from "@/models/models";

const getVbdSimilarity = mock(async (_user: unknown, _item: unknown): Promise<number | undefined> => undefined);

// The vector database client would otherwise open Mongo/Qdrant connections on import.
mock.module("@/lib/data/vdb", () => ({ getVbdSimilarity }));

const {
    calculateDistance,
    getActivity,
    getCirclePopularity,
    getCreatedAt,
    getMetrics,
    getPopularity,
    getPostPopularity,
    getProximity,
    getRank,
    getRecentness,
    getSimilarity,
    normalizeCosineSimilarity,
} = await import("./metrics");

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const london: LngLat = { lng: -0.1278, lat: 51.5074 };
const paris: LngLat = { lng: 2.3522, lat: 48.8566 };

const user = (overrides: Partial<Circle> = {}) => ({ circleType: "user", ...overrides }) as Circle;
const circle = (overrides: Partial<Circle> = {}) => ({ circleType: "circle", ...overrides }) as Circle;
const post = (overrides: Partial<PostDisplay> = {}) =>
    ({ circleType: "post", reactions: {}, comments: 0, ...overrides }) as unknown as PostDisplay;

beforeEach(() => {
    getVbdSimilarity.mockReset();
    getVbdSimilarity.mockResolvedValue(undefined);
});

describe("normalizeCosineSimilarity", () => {
    test.each([
        [-1, 0],
        [0, 0.5],
        [1, 1],
        [0.5, 0.75],
    ])("maps %d onto %d", (input, expected) => {
        expect(normalizeCosineSimilarity(input)).toBe(expected);
    });
});

describe("calculateDistance", () => {
    test("is undefined when either point is missing", () => {
        expect(calculateDistance(undefined, paris)).toBeUndefined();
        expect(calculateDistance(london, undefined)).toBeUndefined();
        expect(calculateDistance()).toBeUndefined();
    });

    test("is zero for identical points", () => {
        expect(calculateDistance(london, london)).toBe(0);
    });

    test("measures London to Paris at roughly 343 km", () => {
        expect(calculateDistance(london, paris)).toBeCloseTo(343.5, 0);
    });

    test("is symmetric", () => {
        expect(calculateDistance(london, paris)).toBeCloseTo(calculateDistance(paris, london)!, 10);
    });

    test("measures half the earth's circumference between antipodes", () => {
        expect(calculateDistance({ lng: 0, lat: 0 }, { lng: 180, lat: 0 })).toBeCloseTo(Math.PI * 6371, 3);
    });
});

describe("getProximity", () => {
    test("is undefined when a point is missing", () => {
        expect(getProximity(undefined, paris)).toBeUndefined();
        expect(getProximity(london, undefined)).toBeUndefined();
    });

    test("is 1 for identical points", () => {
        expect(getProximity(london, london)).toBe(1);
    });

    test("decreases linearly with distance over a 20000 km horizon", () => {
        const distance = calculateDistance(london, paris)!;
        expect(getProximity(london, paris)).toBeCloseTo(1 - distance / 20000, 12);
    });

    test("is close to zero at the antipode", () => {
        expect(getProximity({ lng: 0, lat: 0 }, { lng: 180, lat: 0 })).toBeCloseTo(1 - (Math.PI * 6371) / 20000, 6);
    });
});

describe("getRecentness", () => {
    test("is undefined without a creation date", () => {
        expect(getRecentness(undefined, NOW)).toBeUndefined();
    });

    test("is 1 for something created right now", () => {
        expect(getRecentness(NOW, NOW)).toBe(1);
    });

    test("is 0.5 after one day and 0.25 after three days", () => {
        expect(getRecentness(daysAgo(1), NOW)).toBe(0.5);
        expect(getRecentness(daysAgo(3), NOW)).toBe(0.25);
    });

    test("exceeds 1 for a creation date in the future", () => {
        expect(getRecentness(new Date(NOW.getTime() + DAY_MS / 2), NOW)).toBeCloseTo(1 / 0.5, 12);
    });
});

describe("getActivity", () => {
    test("is undefined without a last activity date", () => {
        expect(getActivity(post(), NOW)).toBeUndefined();
    });

    test("decays with the days since the last activity", () => {
        expect(getActivity(post({ lastActivityAt: NOW }), NOW)).toBe(1);
        expect(getActivity(post({ lastActivityAt: daysAgo(1) }), NOW)).toBe(0.5);
        expect(getActivity(post({ lastActivityAt: daysAgo(9) }), NOW)).toBe(0.1);
    });
});

describe("getPostPopularity", () => {
    test("is zero for a post without reactions or comments", () => {
        expect(getPostPopularity(post())).toBe(0);
    });

    test("weighs a reaction as 1 and a comment as 2", () => {
        // score = 3 * 1 + 2 * 2 = 7 -> log10(8) / log10(1001)
        expect(getPostPopularity(post({ reactions: { like: 2, love: 1 }, comments: 2 }))).toBeCloseTo(
            Math.log10(8) / Math.log10(1001),
            12,
        );
    });

    test("is exactly 1 at the normalization ceiling of 1000", () => {
        expect(getPostPopularity(post({ reactions: { like: 1000 } }))).toBe(1);
    });

    test("exceeds 1 beyond the ceiling", () => {
        expect(getPostPopularity(post({ reactions: { like: 5000 } }))!).toBeGreaterThan(1);
    });

    test("throws when the post has no reactions object", () => {
        expect(() => getPostPopularity({ comments: 1 } as unknown as PostDisplay)).toThrow();
    });
});

describe("getCirclePopularity", () => {
    test("is zero for a circle without members", () => {
        expect(getCirclePopularity(circle())).toBe(0);
        expect(getCirclePopularity(circle({ members: 0 }))).toBe(0);
    });

    test("scales logarithmically with members", () => {
        expect(getCirclePopularity(circle({ members: 9 }))).toBeCloseTo(Math.log10(10) / Math.log10(1001), 12);
        expect(getCirclePopularity(circle({ members: 1000 }))).toBe(1);
    });
});

describe("getPopularity", () => {
    test.each(["circle", "user", "project"] as const)("treats a %s as a circle", (circleType) => {
        expect(getPopularity(circle({ circleType, members: 1000 }))).toBe(1);
    });

    test("treats an item without a circleType as a circle", () => {
        expect(getPopularity({ members: 1000 } as unknown as Circle)).toBe(1);
    });

    test("treats everything else as a post", () => {
        expect(getPopularity(post({ reactions: { like: 1000 } }))).toBe(1);
    });
});

describe("getCreatedAt", () => {
    test("prefers lastActivityAt", () => {
        const item = { lastActivityAt: daysAgo(1), joinedAt: daysAgo(5), createdAt: daysAgo(9) };
        expect(getCreatedAt(item as unknown as PostDisplay)).toBe(item.lastActivityAt);
    });

    test("falls back to joinedAt", () => {
        const item = { joinedAt: daysAgo(5), createdAt: daysAgo(9) };
        expect(getCreatedAt(item as unknown as MemberDisplay)).toBe(item.joinedAt);
    });

    test("falls back to createdAt", () => {
        const item = { createdAt: daysAgo(9) };
        expect(getCreatedAt(item as unknown as Circle)).toBe(item.createdAt);
    });

    test("does not skip a present-but-empty joinedAt in favor of createdAt", () => {
        const item = { joinedAt: undefined, createdAt: daysAgo(9) };
        expect(getCreatedAt(item as unknown as MemberDisplay)).toBeUndefined();
    });

    test("is undefined when no date is available", () => {
        expect(getCreatedAt({} as Circle)).toBeUndefined();
    });
});

describe("getRank", () => {
    const zeroWeights = { similarity: 0, proximity: 0, recentness: 0, popularity: 0, activity: 0 };

    test("defaults to the balanced weights (0 similarity, .25 proximity, .35 recentness, .4 popularity)", () => {
        // proximity falls back to 0.5, everything else missing counts as 0
        expect(getRank({})).toBeCloseTo(1 - 0.5 * 0.25, 12);
    });

    test("is lowest (best) when every weighted metric is at its maximum", () => {
        expect(getRank({ proximity: 1, recentness: 1, popularity: 1 })).toBeCloseTo(0, 12);
    });

    test("combines all weighted metrics", () => {
        const weights = { similarity: 0.1, proximity: 0.2, recentness: 0.3, popularity: 0.25, activity: 0.15 };
        const metrics: Metrics = { similarity: 1, proximity: 0.5, recentness: 0.4, popularity: 0.2, activity: 0.6 };
        expect(getRank(metrics, weights)).toBeCloseTo(
            1 - (0.1 * 1 + 0.2 * 0.5 + 0.3 * 0.4 + 0.25 * 0.2 + 0.15 * 0.6),
            12,
        );
    });

    test("falls back to 0.5 for missing similarity and proximity, and 0 for the rest", () => {
        expect(getRank({}, { ...zeroWeights, similarity: 1 })).toBeCloseTo(0.5, 12);
        expect(getRank({}, { ...zeroWeights, proximity: 1 })).toBeCloseTo(0.5, 12);
        expect(getRank({}, { ...zeroWeights, recentness: 1 })).toBe(1);
        expect(getRank({}, { ...zeroWeights, popularity: 1 })).toBe(1);
        expect(getRank({}, { ...zeroWeights, activity: 1 })).toBe(1);
    });

    test("treats an explicit 0 as a real value, not as missing", () => {
        expect(getRank({ similarity: 0 }, { ...zeroWeights, similarity: 1 })).toBe(1);
    });

    test("ignores metrics that carry no weight", () => {
        expect(getRank({ popularity: 1 }, zeroWeights)).toBe(1);
    });
});

describe("getSimilarity", () => {
    test("is undefined without a user and never queries the vector database", async () => {
        expect(await getSimilarity(undefined as unknown as Circle, circle())).toBeUndefined();
        expect(getVbdSimilarity).not.toHaveBeenCalled();
    });

    test("normalizes the cosine similarity into 0..1", async () => {
        getVbdSimilarity.mockResolvedValue(0.5);
        const currentUser = user();
        const item = circle();

        expect(await getSimilarity(currentUser, item)).toBe(0.75);
        expect(getVbdSimilarity).toHaveBeenCalledWith(currentUser, item);
    });

    test("returns undefined when the vector database has no similarity", async () => {
        getVbdSimilarity.mockResolvedValue(undefined);
        expect(await getSimilarity(user(), circle())).toBeUndefined();
    });

    test("returns a raw zero without normalizing it", async () => {
        getVbdSimilarity.mockResolvedValue(0);
        expect(await getSimilarity(user(), circle())).toBe(0);
    });

    test("maps a perfectly opposite similarity to zero", async () => {
        getVbdSimilarity.mockResolvedValue(-1);
        expect(await getSimilarity(user(), circle())).toBe(0);
    });
});

describe("getMetrics", () => {
    test("returns empty metrics when there is no item", async () => {
        expect(await getMetrics(user(), undefined as unknown as Circle, NOW)).toEqual({});
    });

    test("computes recentness, popularity, activity and rank without a user", async () => {
        const item = circle({ createdAt: daysAgo(1), members: 1000 });

        const metrics = await getMetrics(undefined, item, NOW);

        expect(metrics.recentness).toBe(0.5);
        expect(metrics.popularity).toBe(1);
        expect(metrics.activity).toBeUndefined();
        expect(metrics.similarity).toBeUndefined();
        expect(metrics.distance).toBeUndefined();
        expect(metrics.proximity).toBeUndefined();
        // default weights: proximity 0.25 (falls back to 0.5), recentness 0.35, popularity 0.4
        expect(metrics.rank).toBeCloseTo(1 - (0.5 * 0.25 + 0.5 * 0.35 + 1 * 0.4), 12);
    });

    test("adds distance and proximity when a user is given", async () => {
        const metrics = await getMetrics(
            user({ location: { precision: 4, lngLat: london } }),
            circle({ location: { precision: 4, lngLat: paris }, createdAt: NOW }),
            NOW,
        );

        expect(metrics.distance).toBeCloseTo(343.5, 0);
        expect(metrics.proximity).toBeCloseTo(1 - metrics.distance! / 20000, 12);
    });

    test("leaves distance and proximity undefined when locations are missing", async () => {
        const metrics = await getMetrics(user(), circle({ createdAt: NOW }), NOW);

        expect(metrics.distance).toBeUndefined();
        expect(metrics.proximity).toBeUndefined();
    });

    test("does not look up similarity unless the sorting weights it", async () => {
        await getMetrics(user(), circle({ createdAt: NOW }), NOW);
        await getMetrics(user(), circle({ createdAt: NOW }), NOW, "top");
        await getMetrics(user(), circle({ createdAt: NOW }), NOW, "near");

        expect(getVbdSimilarity).not.toHaveBeenCalled();
    });

    test("does not look up similarity without a user, even when sorting by similarity", async () => {
        const metrics = await getMetrics(undefined, circle({ createdAt: NOW }), NOW, "similarity");

        expect(getVbdSimilarity).not.toHaveBeenCalled();
        expect(metrics.similarity).toBeUndefined();
    });

    test("looks up similarity when sorting by similarity and ranks by it alone", async () => {
        getVbdSimilarity.mockResolvedValue(1);

        const metrics = await getMetrics(user(), circle({ createdAt: NOW }), NOW, "similarity");

        expect(metrics.similarity).toBe(1);
        expect(metrics.rank).toBeCloseTo(0, 12);
    });

    test.each([
        ["near", { proximity: 1 }],
        ["new", { recentness: 1 }],
        ["pop", { popularity: 1 }],
    ] as const)("ranks by a single metric when sorting by %s", async (sorting, best) => {
        const item = circle({ createdAt: NOW, members: 1000, location: { precision: 4, lngLat: london } });
        const metrics = await getMetrics(user({ location: { precision: 4, lngLat: london } }), item, NOW, sorting);

        const [key, value] = Object.entries(best)[0] as [keyof Metrics, number];
        expect(metrics[key]).toBeCloseTo(value, 12);
        expect(metrics.rank).toBeCloseTo(0, 12);
    });

    test("ranks by activity when sorting by activity", async () => {
        const metrics = await getMetrics(
            undefined,
            post({ createdAt: daysAgo(10), lastActivityAt: NOW } as Partial<PostDisplay>),
            NOW,
            "activity",
        );

        expect(metrics.activity).toBe(1);
        expect(metrics.rank).toBe(0);
    });

    test("uses custom weights only when sorting by custom", async () => {
        const item = circle({ createdAt: NOW, members: 1000 });
        const weights = { similarity: 0, proximity: 0, recentness: 0.5, popularity: 0.5, activity: 0 };

        const custom = await getMetrics(undefined, item, NOW, "custom", weights);
        const ignored = await getMetrics(undefined, item, NOW, "top", weights);

        expect(custom.rank).toBeCloseTo(0, 12);
        expect(ignored.rank).not.toBeCloseTo(0, 6);
    });

    test("falls back to the default weights for custom sorting without weights", async () => {
        const item = circle({ createdAt: NOW, members: 1000 });

        const custom = await getMetrics(undefined, item, NOW, "custom");
        const top = await getMetrics(undefined, item, NOW, "top");

        expect(custom.rank).toBe(top.rank);
    });

    test("falls back to the default weights for an unknown sorting option", async () => {
        const item = circle({ createdAt: NOW, members: 1000 });

        const unknown = await getMetrics(undefined, item, NOW, "bogus" as never);
        const top = await getMetrics(undefined, item, NOW, "top");

        expect(unknown.rank).toBe(top.rank);
    });

    test("uses lastActivityAt for recentness of posts and joinedAt for members", async () => {
        const fromActivity = await getMetrics(
            undefined,
            post({ createdAt: daysAgo(10), lastActivityAt: daysAgo(1) } as Partial<PostDisplay>),
            NOW,
        );
        const fromJoin = await getMetrics(
            undefined,
            { circleType: "user", joinedAt: daysAgo(3), createdAt: daysAgo(30) } as unknown as MemberDisplay,
            NOW,
        );

        expect(fromActivity.recentness).toBe(0.5);
        expect(fromJoin.recentness).toBe(0.25);
    });

    test("leaves recentness undefined when the item has no date", async () => {
        const metrics = await getMetrics(undefined, circle(), NOW);
        expect(metrics.recentness).toBeUndefined();
    });
});

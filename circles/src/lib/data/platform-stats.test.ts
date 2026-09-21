import { beforeEach, describe, expect, mock, test } from "bun:test";
import { matchesFilter } from "@/test/fake-mongo";
import { mockDb } from "@/test/mock-db";
import { getPublishedCircleQuery } from "./circle-discovery-queries";
import { getDiscoverableLifecycleQuery } from "./circle-lifecycle-policy";
import { getPublicCircleCountQuery } from "./platform-stats-query";

const db = mockDb();
mock.module("server-only", () => ({}));

const cacheCalls: { keys: string[]; options: unknown }[] = [];
mock.module("next/cache", () => ({
    unstable_cache: (fn: () => Promise<unknown>, keys: string[], options: unknown) => {
        cacheCalls.push({ keys, options });
        return fn;
    },
}));
mock.module("@/lib/data/circle", () => ({ getDiscoverableLifecycleQuery, getPublishedCircleQuery }));

const { getPublicPlatformStats } = await import("./platform-stats");

const seed = (circleType: string, overrides: Record<string, unknown> = {}) =>
    db.Circles.docs.push({ _id: db.Circles.docs.length + 1, circleType, ...overrides });

beforeEach(() => {
    db.Circles.docs = [];
});

describe("getPublicPlatformStats", () => {
    test("is cached under a stable key for an hour", () => {
        expect(cacheCalls).toEqual([{ keys: ["public-platform-stats"], options: { revalidate: 3600 } }]);
    });

    test("counts zero people and circles on an empty platform", async () => {
        expect(await getPublicPlatformStats()).toEqual({ people: 0, circles: 0 });
    });

    describe("people", () => {
        test("counts verified users and paying members", async () => {
            seed("user", { isVerified: true });
            seed("user", { isMember: true });
            seed("user", { isVerified: true, isMember: true });

            expect((await getPublicPlatformStats()).people).toBe(3);
        });

        test("does not count users who are neither verified nor members", async () => {
            seed("user");
            seed("user", { isVerified: false, isMember: false });

            expect((await getPublicPlatformStats()).people).toBe(0);
        });

        test("does not count users whose publish status is not published", async () => {
            seed("user", { isVerified: true, publishStatus: "draft" });
            seed("user", { isVerified: true, publishStatus: "published" });

            expect((await getPublicPlatformStats()).people).toBe(1);
        });

        test("counts users regardless of moderation status, since profiles are always discoverable", async () => {
            seed("user", { isVerified: true, moderationStatus: "suspended" });

            expect((await getPublicPlatformStats()).people).toBe(1);
        });

        test("does not count circles or projects", async () => {
            seed("circle", { isVerified: true });
            seed("project", { isMember: true });

            expect((await getPublicPlatformStats()).people).toBe(0);
        });
    });

    describe("circles", () => {
        test("counts public circles and projects using the shared public-circle query", async () => {
            seed("circle");
            seed("project");
            seed("circle", { visibility: "secret" });
            seed("circle", { moderationStatus: "removed" });
            seed("user", { isVerified: true });

            const expected = db.Circles.docs.filter((doc) => matchesFilter(doc, getPublicCircleCountQuery())).length;

            expect(expected).toBe(2);
            expect((await getPublicPlatformStats()).circles).toBe(expected);
        });
    });

    test("computes both counts independently", async () => {
        seed("user", { isVerified: true });
        seed("circle");
        seed("circle");

        expect(await getPublicPlatformStats()).toEqual({ people: 1, circles: 2 });
    });

    test("propagates database failures", async () => {
        db.Circles.countDocuments = (async () => {
            throw new Error("db down");
        }) as never;

        await expect(getPublicPlatformStats()).rejects.toThrow("db down");
        delete (db.Circles as { countDocuments?: unknown }).countDocuments;
    });
});

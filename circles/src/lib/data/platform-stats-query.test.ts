import { describe, expect, test } from "bun:test";
import { matchesFilter } from "@/test/fake-mongo";
import { getPublicCircleCountQuery } from "./platform-stats-query";

const matches = (doc: Record<string, unknown>) => matchesFilter(doc, getPublicCircleCountQuery());

describe("getPublicCircleCountQuery", () => {
    test("combines type, publication, lifecycle and visibility conditions", () => {
        const query = getPublicCircleCountQuery();

        expect(query.$and).toHaveLength(4);
        expect(query.$and![0]).toEqual({ circleType: { $in: ["circle", "project"] } });
    });

    test("returns a new query on every call", () => {
        expect(getPublicCircleCountQuery()).not.toBe(getPublicCircleCountQuery());
    });

    describe("what it counts", () => {
        test.each(["circle", "project"])("counts a public %s", (circleType) => {
            expect(matches({ circleType })).toBe(true);
        });

        test("does not count personal profiles", () => {
            expect(matches({ circleType: "user" })).toBe(false);
        });

        test("counts circles that are explicitly published or predate publish status", () => {
            expect(matches({ circleType: "circle", publishStatus: "published" })).toBe(true);
            expect(matches({ circleType: "circle" })).toBe(true);
        });

        test.each(["draft", "pending_verification"])("does not count a %s circle", (publishStatus) => {
            expect(matches({ circleType: "circle", publishStatus })).toBe(false);
        });

        test.each(["active", "paused"])("counts a %s circle", (moderationStatus) => {
            expect(matches({ circleType: "circle", moderationStatus })).toBe(true);
        });

        test("counts a circle that has no moderation status", () => {
            expect(matches({ circleType: "circle" })).toBe(true);
        });

        test.each(["suspended", "removed"])("does not count a %s circle", (moderationStatus) => {
            expect(matches({ circleType: "circle", moderationStatus })).toBe(false);
        });

        test("does not count secret circles", () => {
            expect(matches({ circleType: "circle", visibility: "secret" })).toBe(false);
        });

        test("counts explicitly public circles and those without a visibility", () => {
            expect(matches({ circleType: "circle", visibility: "public" })).toBe(true);
            expect(matches({ circleType: "circle" })).toBe(true);
        });

        test("requires every condition at once", () => {
            expect(matches({ circleType: "circle", publishStatus: "published", moderationStatus: "active", visibility: "secret" })).toBe(false);
            expect(matches({ circleType: "circle", publishStatus: "draft", moderationStatus: "active", visibility: "public" })).toBe(false);
        });
    });
});

import { describe, expect, test } from "bun:test";
import type { Media } from "@/models/models";
import { DEFAULT_HERO_IMAGE_URLS, getDefaultHeroImage, hasCircleImages } from "./default-heroes";

describe("DEFAULT_HERO_IMAGE_URLS", () => {
    test("lists seven distinct webp hero images", () => {
        expect(DEFAULT_HERO_IMAGE_URLS).toHaveLength(7);
        expect(new Set(DEFAULT_HERO_IMAGE_URLS).size).toBe(7);
        for (const url of DEFAULT_HERO_IMAGE_URLS) {
            expect(url).toMatch(/^\/images\/default-heroes\/kamooni-hero-0[1-7]\.webp$/);
        }
    });
});

describe("getDefaultHeroImage", () => {
    test("returns the first hero when there is no stable key", () => {
        expect(getDefaultHeroImage().fileInfo.url).toBe(DEFAULT_HERO_IMAGE_URLS[0]);
        expect(getDefaultHeroImage("").fileInfo.url).toBe(DEFAULT_HERO_IMAGE_URLS[0]);
        expect(getDefaultHeroImage(undefined).fileInfo.url).toBe(DEFAULT_HERO_IMAGE_URLS[0]);
    });

    test("describes the image as a webp named after the file", () => {
        expect(getDefaultHeroImage()).toEqual({
            name: "kamooni-hero-01.webp",
            type: "image/webp",
            fileInfo: { url: "/images/default-heroes/kamooni-hero-01.webp" },
        });
    });

    test("is stable for the same key", () => {
        expect(getDefaultHeroImage("circle-42")).toEqual(getDefaultHeroImage("circle-42"));
    });

    test("always yields one of the default hero images", () => {
        for (const key of ["a", "circle-1", "circle-2", "😀", "x".repeat(500)]) {
            expect(DEFAULT_HERO_IMAGE_URLS).toContain(getDefaultHeroImage(key).fileInfo.url as never);
        }
    });

    test("picks a hero using a 31-based string hash modulo the number of heroes", () => {
        // "a" -> 97 % 7 = 6; "ab" -> (97 * 31 + 98) % 7 = 3105 % 7 = 4
        expect(getDefaultHeroImage("a").fileInfo.url).toBe(DEFAULT_HERO_IMAGE_URLS[6]);
        expect(getDefaultHeroImage("ab").fileInfo.url).toBe(DEFAULT_HERO_IMAGE_URLS[4]);
    });

    test("spreads different keys across the available heroes", () => {
        const urls = new Set(Array.from({ length: 100 }, (_, index) => getDefaultHeroImage(`key-${index}`).fileInfo.url));
        expect(urls.size).toBe(7);
    });

    test("does not mutate the shared url list or return shared objects", () => {
        const first = getDefaultHeroImage("k");
        first.name = "changed";
        expect(getDefaultHeroImage("k").name).not.toBe("changed");
    });
});

describe("hasCircleImages", () => {
    test("is false for missing or empty image lists", () => {
        expect(hasCircleImages(undefined)).toBe(false);
        expect(hasCircleImages()).toBe(false);
        expect(hasCircleImages([])).toBe(false);
    });

    test("is true when at least one image is present", () => {
        expect(hasCircleImages([{ name: "a", type: "image/png", fileInfo: { url: "/a.png" } } as Media])).toBe(true);
    });
});

import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { ObjectId } from "mongodb";
import { DEFAULT_WELCOME_BANNER_TEXT, WELCOME_BANNER_KEY } from "@/config/platform-banner";
import { useFakeNow } from "@/test/hooks";
import { mockDb, namedCollection } from "@/test/mock-db";

const db = mockDb();

const banners = await import("./system-banners");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const collection = () => namedCollection(db, "systemBanners");

const seedBanner = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    collection().docs.push({ _id, key: WELCOME_BANNER_KEY, type: "alert", text: "Hello world", isActive: true, updatedAt: NOW, ...overrides });
    return _id;
};

beforeEach(() => {
    collection().docs = [];
});

describe("getActiveBanner", () => {
    test("returns null when there is no banner", async () => {
        expect(await banners.getActiveBanner()).toBeNull();
    });

    test("returns the active welcome banner with its id as a string", async () => {
        const id = seedBanner();

        expect(await banners.getActiveBanner()).toMatchObject({ _id: id.toString(), text: "Hello world", type: "alert", isActive: true });
    });

    test("ignores an inactive banner", async () => {
        seedBanner({ isActive: false });

        expect(await banners.getActiveBanner()).toBeNull();
    });

    test("ignores banners stored under other keys", async () => {
        seedBanner({ key: "other" });

        expect(await banners.getActiveBanner()).toBeNull();
    });

    test.each([["empty", ""], ["blank", "   \n"], ["missing", undefined]])("treats a banner with %s text as no banner", async (_label, text) => {
        seedBanner({ text });

        expect(await banners.getActiveBanner()).toBeNull();
    });

    describe("call to action", () => {
        test("keeps an explicit ctaEnabled value", async () => {
            seedBanner({ ctaEnabled: false, type: "cta", ctaLabel: "Go", ctaUrl: "/go" });

            expect((await banners.getActiveBanner())!.ctaEnabled).toBe(false);
        });

        test("derives ctaEnabled for a cta banner that has a label and url", async () => {
            seedBanner({ type: "cta", ctaLabel: "Go", ctaUrl: "/go" });

            expect((await banners.getActiveBanner())!.ctaEnabled).toBe(true);
        });

        test.each([
            ["a missing label", { ctaUrl: "/go" }],
            ["a blank label", { ctaLabel: "  ", ctaUrl: "/go" }],
            ["a missing url", { ctaLabel: "Go" }],
            ["a blank url", { ctaLabel: "Go", ctaUrl: " " }],
        ])("derives ctaEnabled as false for a cta banner with %s", async (_label, fields) => {
            seedBanner({ type: "cta", ...fields });

            expect((await banners.getActiveBanner())!.ctaEnabled).toBe(false);
        });

        test.each(["alert", "announcement"])("derives ctaEnabled as false for a %s banner even with a label and url", async (type) => {
            seedBanner({ type, ctaLabel: "Go", ctaUrl: "/go" });

            expect((await banners.getActiveBanner())!.ctaEnabled).toBe(false);
        });
    });
});

describe("getWelcomeBannerDraft", () => {
    test("falls back to the default text when nothing is stored", async () => {
        expect(await banners.getWelcomeBannerDraft()).toEqual({
            banner: null,
            bannerSource: "fallback",
            type: "alert",
            text: DEFAULT_WELCOME_BANNER_TEXT,
            ctaEnabled: false,
            ctaLabel: "",
            ctaUrl: "",
            isActive: true,
            updatedAt: undefined,
        });
    });

    test("reflects the stored banner", async () => {
        seedBanner({ type: "announcement", text: "Big news", isActive: false, ctaEnabled: true, ctaLabel: "Read", ctaUrl: "/news" });

        const draft = await banners.getWelcomeBannerDraft();

        expect(draft).toMatchObject({
            bannerSource: "db",
            type: "announcement",
            text: "Big news",
            ctaEnabled: true,
            ctaLabel: "Read",
            ctaUrl: "/news",
            isActive: false,
            updatedAt: NOW,
        });
        expect(draft.banner).toMatchObject({ text: "Big news" });
    });

    test("includes inactive banners, unlike the active lookup", async () => {
        seedBanner({ isActive: false });

        expect((await banners.getWelcomeBannerDraft()).bannerSource).toBe("db");
        expect(await banners.getActiveBanner()).toBeNull();
    });

    test("uses the default text when the stored text is empty", async () => {
        seedBanner({ text: "" });

        expect((await banners.getWelcomeBannerDraft()).text).toBe(DEFAULT_WELCOME_BANNER_TEXT);
    });

    test("derives ctaEnabled from a cta banner with a label and url", async () => {
        seedBanner({ type: "cta", ctaLabel: "Go", ctaUrl: "/go" });

        expect((await banners.getWelcomeBannerDraft()).ctaEnabled).toBe(true);
    });

    test("treats a stored banner without isActive as active", async () => {
        seedBanner({ isActive: undefined });
        delete collection().docs[0].isActive;

        expect((await banners.getWelcomeBannerDraft()).isActive).toBe(true);
    });
});

describe("saveWelcomeBanner", () => {
    const input = { type: "cta" as const, text: "Join us", ctaEnabled: true, ctaLabel: "Join", ctaUrl: "/join", isActive: true, updatedBy: "did:admin" };

    test("stores the banner under the welcome key and returns it", async () => {
        const saved = await banners.saveWelcomeBanner(input);

        expect(saved).toMatchObject({ key: WELCOME_BANNER_KEY, ...input, updatedAt: NOW });
        expect(collection().docs).toHaveLength(1);
        expect(saved._id).toBeString();
    });

    test("replaces the previous welcome banner instead of adding another", async () => {
        await banners.saveWelcomeBanner(input);
        await banners.saveWelcomeBanner({ ...input, text: "Updated" });

        expect(collection().docs).toHaveLength(1);
        expect((await banners.getWelcomeBannerDraft()).text).toBe("Updated");
    });

    test("normalizes missing call to action fields", async () => {
        const saved = await banners.saveWelcomeBanner({ type: "alert", text: "Hi", isActive: false });

        expect(saved).toMatchObject({ ctaEnabled: false, ctaLabel: "", ctaUrl: "", isActive: false, updatedBy: undefined });
    });

    test("coerces ctaEnabled to a boolean", async () => {
        expect((await banners.saveWelcomeBanner({ ...input, ctaEnabled: undefined })).ctaEnabled).toBe(false);
    });

    test("stamps the time of the save", async () => {
        await banners.saveWelcomeBanner(input);
        const later = new Date(NOW.getTime() + 60_000);
        setSystemTime(later);

        expect((await banners.saveWelcomeBanner(input)).updatedAt).toEqual(later);
    });

    test("does not touch banners stored under other keys", async () => {
        seedBanner({ key: "other", text: "Other" });

        await banners.saveWelcomeBanner(input);

        expect(collection().docs).toHaveLength(2);
        expect(collection().docs.find((doc) => doc.key === "other")!.text).toBe("Other");
    });

    test("makes the saved banner the active one", async () => {
        await banners.saveWelcomeBanner(input);

        expect(await banners.getActiveBanner()).toMatchObject({ text: "Join us", ctaEnabled: true });
    });
});

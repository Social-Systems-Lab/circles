import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { getNextFoundingMemberNumber, getNextSignupOrder, getPlatformSettings, updatePlatformSettings } = await import("./platform-settings");

const DEFAULTS = { foundingMemberWindowOpen: true, foundingMemberCap: 1000, signupOrderCounter: 0, foundingMemberCounter: 0 };
const settings = () => db.PlatformSettingsCollection.docs.find((doc) => doc._id === "singleton");

beforeEach(() => {
    db.PlatformSettingsCollection.docs = [];
});

describe("getPlatformSettings", () => {
    test("returns the defaults when nothing is stored", async () => {
        expect(await getPlatformSettings()).toEqual({ ...DEFAULTS, _id: undefined });
    });

    test("lets stored values override the defaults", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton", foundingMemberCap: 50, signupOrderCounter: 7, foundingMemberWindowOpen: false }];

        expect(await getPlatformSettings()).toEqual({
            foundingMemberWindowOpen: false,
            foundingMemberCap: 50,
            signupOrderCounter: 7,
            foundingMemberCounter: 0,
            _id: "singleton",
        });
    });

    test("returns extra stored fields", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton", note: "hello" }];

        expect(await getPlatformSettings()).toMatchObject({ ...DEFAULTS, note: "hello" });
    });

    test("only reads the singleton document", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "other", foundingMemberCap: 1 }];

        expect((await getPlatformSettings()).foundingMemberCap).toBe(1000);
    });

    test("returns the id as a string", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton" }];

        expect((await getPlatformSettings())._id).toBe("singleton");
    });
});

describe("updatePlatformSettings", () => {
    test("creates the settings document when it does not exist", async () => {
        await updatePlatformSettings({ foundingMemberCap: 25 });

        expect(settings()).toMatchObject({ _id: "singleton", foundingMemberCap: 25 });
    });

    test("merges the patch into the existing settings", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton", foundingMemberCap: 25, signupOrderCounter: 9 }];

        await updatePlatformSettings({ foundingMemberWindowOpen: false });

        expect(settings()).toMatchObject({ foundingMemberCap: 25, signupOrderCounter: 9, foundingMemberWindowOpen: false });
    });

    test("does not create more than one settings document", async () => {
        await updatePlatformSettings({ foundingMemberCap: 1 });
        await updatePlatformSettings({ foundingMemberCap: 2 });

        expect(db.PlatformSettingsCollection.docs).toHaveLength(1);
        expect(settings()!.foundingMemberCap).toBe(2);
    });

    test("accepts an empty patch without changing anything", async () => {
        await expect(updatePlatformSettings({})).resolves.toBeUndefined();
    });
});

describe("getNextSignupOrder", () => {
    test("starts at 1 and counts up", async () => {
        expect(await getNextSignupOrder()).toBe(1);
        expect(await getNextSignupOrder()).toBe(2);
        expect(await getNextSignupOrder()).toBe(3);
    });

    test("continues from the stored counter", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton", signupOrderCounter: 41 }];

        expect(await getNextSignupOrder()).toBe(42);
        expect(settings()!.signupOrderCounter).toBe(42);
    });

    test("does not touch the founding member counter", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton", foundingMemberCounter: 5 }];

        await getNextSignupOrder();

        expect(settings()!.foundingMemberCounter).toBe(5);
    });

    test("hands out distinct numbers to concurrent callers", async () => {
        const numbers = await Promise.all(Array.from({ length: 10 }, () => getNextSignupOrder()));

        expect(new Set(numbers).size).toBe(10);
    });

    test("falls back to 1 when the database returns no document", async () => {
        db.PlatformSettingsCollection.findOneAndUpdate = (async () => null) as never;

        expect(await getNextSignupOrder()).toBe(1);
        delete (db.PlatformSettingsCollection as { findOneAndUpdate?: unknown }).findOneAndUpdate;
    });
});

describe("getNextFoundingMemberNumber", () => {
    test("starts at 1 and counts up independently of the signup order", async () => {
        expect(await getNextFoundingMemberNumber()).toBe(1);
        expect(await getNextSignupOrder()).toBe(1);
        expect(await getNextFoundingMemberNumber()).toBe(2);
    });

    test("never decreases when the settings are updated", async () => {
        await getNextFoundingMemberNumber();
        await getNextFoundingMemberNumber();
        await updatePlatformSettings({ foundingMemberCap: 5 });

        expect(await getNextFoundingMemberNumber()).toBe(3);
    });

    test("continues from the stored counter", async () => {
        db.PlatformSettingsCollection.docs = [{ _id: "singleton", foundingMemberCounter: 99 }];

        expect(await getNextFoundingMemberNumber()).toBe(100);
    });
});

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { mockAuthModule } from "@/test/mock-auth";
import { mockDb } from "@/test/mock-db";

const restoreEnv = snapshotEnv("version");

const db = mockDb();
const { getAuthenticatedUserDid } = mockAuthModule("did:admin");
const consoleSpy = silenceConsole("log");

const getServerSettings = mock(async () => ({ name: "Current" }));
const updateServerSettings = mock(async (_settings: unknown) => {});
mock.module("@/lib/data/server-settings", () => ({ getServerSettings, updateServerSettings }));

const upsertVdbCollections = mock(async () => {});
mock.module("@/lib/data/vdb", () => ({ upsertVdbCollections }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

const { saveServerSettings } = await import("./actions");

const values = {
    name: "Kamooni",
    description: "A community platform",
    url: "https://kamooni.example",
    registryUrl: "https://registry.example",
    jwtSecret: "jwt-secret",
    openaiKey: "openai-key",
    mapboxKey: "mapbox-key",
};

beforeEach(() => {
    setEnv("version", undefined);
    db.Circles.docs = [{ _id: new ObjectId(), did: "did:admin", circleType: "user", isAdmin: true }];
    getServerSettings.mockClear();
    updateServerSettings.mockReset();
    updateServerSettings.mockResolvedValue(undefined);
    upsertVdbCollections.mockReset();
    upsertVdbCollections.mockResolvedValue(undefined);
});
afterAll(restoreEnv);

describe("saveServerSettings", () => {
    describe("who may save", () => {
        test("requires a signed-in user", async () => {
            getAuthenticatedUserDid.mockResolvedValue(undefined);

            expect(await saveServerSettings(values)).toEqual({ success: false, message: "You need to be logged in to edit server settings" });
            expect(updateServerSettings).not.toHaveBeenCalled();
        });

        test.each([
            ["is not an admin", { did: "did:admin", isAdmin: false }],
            ["has no admin flag", { did: "did:admin" }],
        ])("refuses a user who %s", async (_label, fields) => {
            db.Circles.docs = [{ _id: new ObjectId(), circleType: "user", ...fields }];

            expect(await saveServerSettings(values)).toEqual({ success: false, message: "You are not authorized to edit server settings" });
            expect(updateServerSettings).not.toHaveBeenCalled();
        });

        // Unlike the superadmin check used elsewhere (`isAdmin === true`), this action tests the flag for truthiness.
        test("currently accepts any truthy admin flag, not only true", async () => {
            db.Circles.docs = [{ _id: new ObjectId(), did: "did:admin", circleType: "user", isAdmin: "yes" }];

            expect((await saveServerSettings(values)).success).toBe(true);
        });

        test("refuses a signed-in did that has no profile", async () => {
            db.Circles.docs = [];

            expect(await saveServerSettings(values)).toEqual({ success: false, message: "You are not authorized to edit server settings" });
            expect(updateServerSettings).not.toHaveBeenCalled();
        });

        test("does not read or save any settings for someone who is not allowed", async () => {
            db.Circles.docs = [];

            await saveServerSettings(values);

            expect(getServerSettings).not.toHaveBeenCalled();
            expect(updateServerSettings).not.toHaveBeenCalled();
        });
    });

    describe("what gets saved", () => {
        test("saves the submitted settings and reports success", async () => {
            expect(await saveServerSettings(values)).toEqual({ success: true, message: "Server settings updated successfully" });

            expect(updateServerSettings).toHaveBeenCalledTimes(1);
            expect(updateServerSettings.mock.calls[0][0]).toMatchObject(values);
        });

        test("saves only the known fields, ignoring anything else in the payload", async () => {
            await saveServerSettings({ ...values, did: "attacker-did", defaultCircleId: "attacker-circle", isAdmin: true } as never);

            const saved = updateServerSettings.mock.calls[0][0] as Record<string, unknown>;
            expect(saved).not.toHaveProperty("did");
            expect(saved).not.toHaveProperty("defaultCircleId");
            expect(saved).not.toHaveProperty("isAdmin");
        });

        test("passes undefined for fields that were not submitted", async () => {
            await saveServerSettings({ name: "Only name" });

            expect(updateServerSettings.mock.calls[0][0]).toMatchObject({ name: "Only name", url: undefined, jwtSecret: undefined });
        });

        test("loads the current settings first", async () => {
            await saveServerSettings(values);

            expect(getServerSettings).toHaveBeenCalledTimes(1);
        });
    });

    describe("embedding refresh on version changes", () => {
        test("does nothing extra when the app has no version configured", async () => {
            await saveServerSettings(values);

            expect(upsertVdbCollections).not.toHaveBeenCalled();
            expect(updateServerSettings.mock.calls[0][0]).not.toHaveProperty("serverVersion", expect.anything());
        });

        test("refreshes the embeddings and records the app version when one is configured", async () => {
            setEnv("version", "0.8.15");

            await saveServerSettings(values);

            expect(upsertVdbCollections).toHaveBeenCalledTimes(1);
            expect(updateServerSettings.mock.calls[0][0]).toMatchObject({ serverVersion: "0.8.15" });
            expect(consoleSpy.log).toHaveBeenCalledWith("Server version and app version differ, doing intitialization logic");
        });

        // The comparison is against the submitted settings, which never carry a version, so with a configured app
        // version the embeddings are rebuilt on every save rather than only when the version changed.
        test("currently refreshes the embeddings on every save while a version is configured", async () => {
            setEnv("version", "0.8.15");

            await saveServerSettings(values);
            await saveServerSettings(values);

            expect(upsertVdbCollections).toHaveBeenCalledTimes(2);
        });

        test("still saves the settings when the embedding refresh fails, and logs it", async () => {
            setEnv("version", "0.8.15");
            upsertVdbCollections.mockRejectedValue(new Error("qdrant down"));

            expect((await saveServerSettings(values)).success).toBe(true);

            expect(consoleSpy.log).toHaveBeenCalledWith("Failed to upsert embeddings", expect.any(Error));
            expect(updateServerSettings).toHaveBeenCalledTimes(1);
        });
    });

    describe("failures", () => {
        test("reports the message of an Error thrown while saving", async () => {
            updateServerSettings.mockRejectedValue(new Error("Server settings not found"));

            expect(await saveServerSettings(values)).toEqual({ success: false, message: "Server settings not found" });
        });

        test("describes a thrown value that is not an Error", async () => {
            updateServerSettings.mockRejectedValue({ code: 7 });

            expect(await saveServerSettings(values)).toEqual({ success: false, message: 'Failed to save circle server settings. {"code":7}' });
        });

        test("reports a failure to load the current settings", async () => {
            getServerSettings.mockRejectedValueOnce(new Error("db down"));

            expect(await saveServerSettings(values)).toEqual({ success: false, message: "db down" });
            expect(updateServerSettings).not.toHaveBeenCalled();
        });
    });

    test("logs the submitted values, including secrets, in plain text", async () => {
        await saveServerSettings(values);

        expect(consoleSpy.log).toHaveBeenCalledWith("Saving server settings with values", values);
    });
});

import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ObjectId } from "mongodb";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useSpyCleanup, useStubbedFetch } from "@/test/hooks";
import { mockDb, namedCollection } from "@/test/mock-db";

const ENV_NAMES = ["IS_BUILD", "CIRCLES_INSTANCE_NAME", "CIRCLES_URL", "CIRCLES_REGISTRY_URL", "CIRCLES_JWT_SECRET", "OPENAI_API_KEY", "MAPBOX_API_KEY"];
const restoreEnv = snapshotEnv(...ENV_NAMES);

const db = mockDb();
mock.module("next/navigation", () => ({ redirect: mock() }));

const createDefaultCircle = mock(() => ({ name: "Default Circle", handle: "default", circleType: "circle" }));
mock.module("@/lib/data/circle", () => ({ createDefaultCircle }));

const createServerDid = mock(async () => ({ did: "server-did", publicKey: "server-public-key" }));
const getServerPublicKey = mock(() => "server-public-key");
const signRegisterServerChallenge = mock((challenge: string) => `signed:${challenge}`);
mock.module("@/lib/auth/auth", () => ({ createServerDid, getServerPublicKey, signRegisterServerChallenge }));

const settings = await import("./server-settings");

const settingsCollection = () => namedCollection(db, "serverSettings");
const consoleSpy = silenceConsole("log", "error");
const trackSpy = useSpyCleanup();

beforeEach(() => {
    for (const name of ENV_NAMES) setEnv(name, undefined);
    settingsCollection().docs = [];
    db.Circles.docs = [];
    db.Sdgs.docs = [];
    db.Skills.docs = [];
    createDefaultCircle.mockClear();
    createServerDid.mockClear();
    signRegisterServerChallenge.mockClear();
});

afterAll(restoreEnv);

describe("urlIsLocal", () => {
    test.each(["http://localhost", "http://localhost:3000", "localhost", "localhost:3000", "http://127.0.0.1", "http://127.0.0.1:3000/x", "127.0.0.1"])(
        "treats %s as local",
        (url) => {
            expect(settings.urlIsLocal(url)).toBe(true);
        },
    );

    test.each([undefined, ""])("treats a missing url (%p) as local", (url) => {
        expect(settings.urlIsLocal(url)).toBe(true);
    });

    test.each(["https://kamooni.org", "http://example.com", "https://localhost", "http://192.168.1.10", "http://[::1]:3000", "http://mylocalhost"])(
        "treats %s as not local",
        (url) => {
            expect(settings.urlIsLocal(url)).toBe(false);
        },
    );
});

describe("upsertSdgsAndSkills", () => {
    test("stores every goal and skill by handle", async () => {
        await settings.upsertSdgsAndSkills();

        expect(db.Sdgs.docs).toHaveLength(sdgs.length);
        expect(db.Skills.docs).toHaveLength(skills.length);
        expect(db.Sdgs.docs[0]).toMatchObject({ handle: sdgs[0].handle, name: sdgs[0].name, description: sdgs[0].description, picture: sdgs[0].picture });
        expect(db.Skills.docs[0]).toMatchObject({ handle: skills[0].handle, name: skills[0].name });
    });

    test("is idempotent, so running it twice does not duplicate anything", async () => {
        await settings.upsertSdgsAndSkills();
        await settings.upsertSdgsAndSkills();

        expect(db.Sdgs.docs).toHaveLength(sdgs.length);
        expect(db.Skills.docs).toHaveLength(skills.length);
    });

    test("refreshes the details of goals that already exist and keeps their ids", async () => {
        const id = new ObjectId();
        db.Sdgs.docs = [{ _id: id, handle: sdgs[0].handle, name: "Old name", description: "Old" }];

        await settings.upsertSdgsAndSkills();

        const stored = db.Sdgs.docs.find((doc) => doc.handle === sdgs[0].handle)!;
        expect(stored._id.equals(id)).toBe(true);
        expect(stored.name).toBe(sdgs[0].name);
    });

    test("does not remove goals or skills that are no longer in the built-in lists", async () => {
        db.Sdgs.docs = [{ _id: new ObjectId(), handle: "custom-goal", name: "Custom" }];

        await settings.upsertSdgsAndSkills();

        expect(db.Sdgs.docs.some((doc) => doc.handle === "custom-goal")).toBe(true);
    });

    test("logs when each list is done", async () => {
        await settings.upsertSdgsAndSkills();

        expect(consoleSpy.log).toHaveBeenCalledWith("All sdgs upserted successfully.");
        expect(consoleSpy.log).toHaveBeenCalledWith("All skills upserted successfully.");
    });

    test("swallows database errors and logs them", async () => {
        trackSpy(spyOn(db.Sdgs, "updateOne").mockRejectedValue(new Error("db down")));

        await expect(settings.upsertSdgsAndSkills()).resolves.toBeUndefined();

        expect(consoleSpy.error).toHaveBeenCalledWith("Error upserting sdgs or skills:", expect.any(Error));
        expect(db.Skills.docs).toHaveLength(0);
    });
});

describe("getServerSettings", () => {
    test("returns placeholder settings during a build without touching the database", async () => {
        setEnv("IS_BUILD", "true");

        expect(await settings.getServerSettings()).toEqual({
            name: "Circles",
            url: "http://localhost:3000",
            registryUrl: "http://localhost:3001",
            defaultCircleId: "default",
        });
        expect(settingsCollection().docs).toHaveLength(0);
    });

    describe("first run", () => {
        test("creates the settings, the default circle and the server identity", async () => {
            const result = await settings.getServerSettings();

            expect(createDefaultCircle).toHaveBeenCalledTimes(1);
            expect(db.Circles.docs).toHaveLength(1);
            expect(db.Circles.docs[0]).toMatchObject({ name: "Default Circle" });
            expect(result.defaultCircleId).toBe(db.Circles.docs[0]._id.toString());
            expect(result.did).toBe("server-did");
            // The empty document inserted first is the one that receives the default circle id and the did.
            expect(settingsCollection().docs).toHaveLength(1);
        });

        test("persists the default circle id and the did on the stored settings", async () => {
            await settings.getServerSettings();

            const stored = settingsCollection().docs.find((doc) => doc.defaultCircleId);
            expect(stored).toMatchObject({ defaultCircleId: db.Circles.docs[0]._id.toString(), did: "server-did" });
        });

        test("does nothing further on the next call", async () => {
            await settings.getServerSettings();
            createDefaultCircle.mockClear();
            createServerDid.mockClear();

            await settings.getServerSettings();

            expect(createDefaultCircle).not.toHaveBeenCalled();
            expect(createServerDid).not.toHaveBeenCalled();
            expect(db.Circles.docs).toHaveLength(1);
        });
    });

    describe("existing settings", () => {
        test("returns them as stored, with the id as a string", async () => {
            const id = new ObjectId();
            settingsCollection().docs = [{ _id: id, name: "Kamooni", url: "https://kamooni.example", defaultCircleId: "c1", did: "did-1" }];

            const result = await settings.getServerSettings();

            expect(result).toMatchObject({ name: "Kamooni", url: "https://kamooni.example", defaultCircleId: "c1", did: "did-1" });
            expect(result._id).toBe(id.toString());
            expect(createDefaultCircle).not.toHaveBeenCalled();
            expect(createServerDid).not.toHaveBeenCalled();
        });

        test("generates a server identity when there is none, without creating another circle", async () => {
            settingsCollection().docs = [{ _id: new ObjectId(), defaultCircleId: "c1" }];

            const result = await settings.getServerSettings();

            expect(result.did).toBe("server-did");
            expect(settingsCollection().docs[0].did).toBe("server-did");
            expect(createDefaultCircle).not.toHaveBeenCalled();
        });
    });

    describe("environment fallbacks", () => {
        const stored = () => settingsCollection().docs.push({ _id: new ObjectId(), defaultCircleId: "c1", did: "did-1" });

        test("fills settings that are missing from the environment", async () => {
            stored();
            setEnv("CIRCLES_INSTANCE_NAME", "Env Circles");
            setEnv("CIRCLES_URL", "https://env.example");
            setEnv("CIRCLES_REGISTRY_URL", "https://registry.example");
            setEnv("CIRCLES_JWT_SECRET", "jwt-secret");
            setEnv("OPENAI_API_KEY", "openai-key");
            setEnv("MAPBOX_API_KEY", "mapbox-key");

            expect(await settings.getServerSettings()).toMatchObject({
                name: "Env Circles",
                url: "https://env.example",
                registryUrl: "https://registry.example",
                jwtSecret: "jwt-secret",
                openaiKey: "openai-key",
                mapboxKey: "mapbox-key",
            });
        });

        test("never overrides values that are stored", async () => {
            settingsCollection().docs.push({ _id: new ObjectId(), defaultCircleId: "c1", did: "did-1", name: "Stored", url: "https://stored.example" });
            setEnv("CIRCLES_INSTANCE_NAME", "Env Circles");
            setEnv("CIRCLES_URL", "https://env.example");

            expect(await settings.getServerSettings()).toMatchObject({ name: "Stored", url: "https://stored.example" });
        });

        test("replaces a stored empty value with the environment's", async () => {
            settingsCollection().docs.push({ _id: new ObjectId(), defaultCircleId: "c1", did: "did-1", name: "" });
            setEnv("CIRCLES_INSTANCE_NAME", "Env Circles");

            expect((await settings.getServerSettings()).name).toBe("Env Circles");
        });

        test("does not persist environment values back to the database", async () => {
            stored();
            setEnv("CIRCLES_INSTANCE_NAME", "Env Circles");

            await settings.getServerSettings();

            expect(settingsCollection().docs[0].name).toBeUndefined();
        });

        test("leaves settings unset when neither the database nor the environment has them", async () => {
            stored();

            const result = await settings.getServerSettings();

            expect(result.name).toBeUndefined();
            expect(result.jwtSecret).toBeUndefined();
        });
    });
});

describe("updateServerSettings", () => {
    test("saves the settings without their id", async () => {
        const id = new ObjectId();
        settingsCollection().docs = [{ _id: id, name: "Old" }];

        await settings.updateServerSettings({ _id: "some-other-id", name: "New", url: "https://new.example" } as never);

        expect(settingsCollection().docs[0]).toMatchObject({ name: "New", url: "https://new.example" });
        expect(settingsCollection().docs[0]._id.equals(id)).toBe(true);
    });

    test("keeps fields that were not part of the update", async () => {
        settingsCollection().docs = [{ _id: new ObjectId(), name: "Old", did: "did-1" }];

        await settings.updateServerSettings({ name: "New" } as never);

        expect(settingsCollection().docs[0]).toMatchObject({ name: "New", did: "did-1" });
    });

    test("fails when there are no settings to update", async () => {
        await expect(settings.updateServerSettings({ name: "New" } as never)).rejects.toThrow("Server settings not found");
    });
});

describe("registerServer", () => {
    const REGISTRY = "https://registry.example";
    const args = { did: "did-1", name: "Kamooni", url: "https://kamooni.example", registryUrl: REGISTRY, publicKey: "pk" };
    const register = (overrides: Partial<typeof args> = {}) => {
        const a = { ...args, ...overrides };
        return settings.registerServer(a.did, a.name, a.url, a.registryUrl, a.publicKey);
    };

    const fetchMock = useStubbedFetch();
    const respond = (...responses: Response[]) => {
        fetchMock.mockReset();
        for (const response of responses) fetchMock.mockResolvedValueOnce(response);
    };
    const happyPath = () => respond(Response.json({ challenge: "abc123" }), Response.json({ success: true }));

    test.each([
        ["did", { did: "" }],
        ["name", { name: "" }],
        ["url", { url: "" }],
        ["registry url", { registryUrl: "" }],
        ["public key", { publicKey: "" }],
    ])("requires a %s", async (_label, overrides) => {
        respond();

        await expect(register(overrides)).rejects.toThrow("Invalid server registration data");

        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("refuses to register a local server with a public registry", async () => {
        respond();

        await expect(register({ url: "http://localhost:3000" })).rejects.toThrow("Cannot register server with local URL");

        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("allows a local server to register with a local registry", async () => {
        happyPath();

        const info = await register({ url: "http://localhost:3000", registryUrl: "http://localhost:3001" });

        expect(info.registryUrl).toBe("http://localhost:3001");
    });

    test("registers, signs the challenge and confirms", async () => {
        happyPath();

        const info = await register();

        expect(info).toEqual({ registryUrl: REGISTRY, registeredAt: expect.any(Date) });
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [registerUrl, registerInit] = fetchMock.mock.calls[0];
        expect(registerUrl).toBe(`${REGISTRY}/servers/register`);
        expect(registerInit?.method).toBe("POST");
        expect(JSON.parse(registerInit?.body as string)).toEqual({ did: "did-1", name: "Kamooni", url: "https://kamooni.example", publicKey: "pk" });
        expect(registerInit?.cache).toBe("no-store");

        expect(signRegisterServerChallenge).toHaveBeenCalledWith("abc123");
        const [confirmUrl, confirmInit] = fetchMock.mock.calls[1];
        expect(confirmUrl).toBe(`${REGISTRY}/servers/register-confirm`);
        expect(JSON.parse(confirmInit?.body as string)).toEqual({ did: "did-1", challenge: "abc123", signature: "signed:abc123" });
    });

    test("fails when the registry rejects the registration, without signing anything", async () => {
        respond(Response.json({ error: "nope" }, { status: 400 }));

        await expect(register()).rejects.toThrow("Failed to register server");

        expect(signRegisterServerChallenge).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("fails when the registry rejects the confirmation", async () => {
        respond(Response.json({ challenge: "abc123" }), Response.json({ success: true }, { status: 401 }));

        await expect(register()).rejects.toThrow("Failed to confirm registration");
    });

    test("fails when the confirmation does not report success", async () => {
        respond(Response.json({ challenge: "abc123" }), Response.json({ success: false }));

        await expect(register()).rejects.toThrow("Failed to confirm registration");
    });

    test("propagates network failures", async () => {
        fetchMock.mockReset();
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

        await expect(register()).rejects.toThrow("ECONNREFUSED");
    });
});

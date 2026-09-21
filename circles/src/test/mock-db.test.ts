import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DB_COLLECTION_EXPORTS, createDbMock, mockDb, namedCollection } from "./mock-db";
import { FakeCollection } from "./fake-mongo";

const realExports = (): string[] => {
    const source = readFileSync(join(import.meta.dir, "../lib/data/db.ts"), "utf8");
    const block = source.match(/\nexport \{\n([\s\S]*?)\n\};/)?.[1] ?? "";
    return block
        .split("\n")
        .map((line) => line.split("//")[0].trim().replace(/,$/, ""))
        .filter(Boolean);
};

describe("createDbMock", () => {
    test("exposes every collection the real db module exports, so named imports always link", () => {
        const mock = createDbMock();
        const expected = [...realExports(), "getDb", "ensureRequiredChatIndexes"].sort();

        expect(Object.keys(mock).sort()).toEqual(expected);
    });

    test("lists exactly the real collection exports", () => {
        const collections = realExports().filter((name) => name !== "client" && name !== "db");
        expect([...DB_COLLECTION_EXPORTS].sort() as string[]).toEqual(collections.sort());
    });

    test("gives each collection its own empty FakeCollection", () => {
        const mock = createDbMock();

        expect(mock.Circles).toBeInstanceOf(FakeCollection);
        expect(mock.Circles).not.toBe(mock.Members);
        expect(mock.Circles.docs).toEqual([]);
    });

    test("returns independent mocks on every call", () => {
        expect(createDbMock().Circles).not.toBe(createDbMock().Circles);
    });

    test("allows overriding any export", async () => {
        const custom = new FakeCollection([{ name: "seed" }]);
        const mock = createDbMock({ Circles: custom, getDb: async () => "custom-db" });

        expect(mock.Circles).toBe(custom as unknown as typeof mock.Circles);
        expect(await mock.getDb()).toBe("custom-db" as unknown as object);
    });

    test("provides a getDb that resolves to a db exposing collection()", async () => {
        const database = (await createDbMock().getDb()) as { collection: (name: string) => unknown };
        expect(database.collection("anything")).toBeInstanceOf(FakeCollection);
    });

    test("returns the same collection for the same name and separate ones for different names", async () => {
        const mock = createDbMock();
        const database = mock.db as { collection: (name: string) => FakeCollection };

        expect(database.collection("a")).toBe(database.collection("a"));
        expect(database.collection("a")).not.toBe(database.collection("b"));
        expect(await mock.getDb()).toBe(mock.db);
    });

    test("keeps documents written through db.collection() between calls", async () => {
        const database = createDbMock().db as { collection: (name: string) => FakeCollection };

        await database.collection("requests").insertOne({ requestId: "r1" });

        expect(await database.collection("requests").findOne({ requestId: "r1" })).toMatchObject({ requestId: "r1" });
    });

    test("does not share named collections between mocks", () => {
        const first = createDbMock().db as { collection: (name: string) => FakeCollection };
        const second = createDbMock().db as { collection: (name: string) => FakeCollection };

        expect(first.collection("a")).not.toBe(second.collection("a"));
    });

    test("provides a no-op ensureRequiredChatIndexes", async () => {
        await expect(createDbMock().ensureRequiredChatIndexes()).resolves.toBeUndefined();
    });
});

describe("mockDb", () => {
    test("installs the fake as the @/lib/data/db module", async () => {
        const db = mockDb();
        db.Circles.docs = [{ _id: "c1", name: "Installed" }];

        const imported = await import("@/lib/data/db");

        expect(imported.Circles).toBe(db.Circles as never);
        expect((imported.Circles as unknown as FakeCollection).docs[0].name).toBe("Installed");
    });

    test("accepts overrides just like createDbMock", () => {
        const custom = new FakeCollection([{ name: "seed" }]);

        expect(mockDb({ Members: custom }).Members).toBe(custom as never);
    });
});

describe("namedCollection", () => {
    test("returns the collection the code under test gets from db.collection(name)", () => {
        const db = createDbMock();
        const named = namedCollection(db, "vibeIdSignInRequests");

        expect(named).toBeInstanceOf(FakeCollection);
        expect((db.db as { collection: (name: string) => unknown }).collection("vibeIdSignInRequests")).toBe(named);
    });

    test("keeps separate collections per name and per mock", () => {
        const db = createDbMock();

        expect(namedCollection(db, "a")).not.toBe(namedCollection(db, "b"));
        expect(namedCollection(db, "a")).not.toBe(namedCollection(createDbMock(), "a"));
    });
});

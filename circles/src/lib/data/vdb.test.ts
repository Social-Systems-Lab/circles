import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const restoreEnv = snapshotEnv("VDB_ENABLED", "QDRANT_HOST", "OPENAI_API_KEY");
afterAll(restoreEnv);

mockDb();

// The real QdrantClient probes the server for a version check the moment it is constructed, which
// floods the run with connection errors. The client-construction cases here only care that vdb.ts
// builds one client and reuses it; the real client's API surface is covered by
// ./vector-client-contract.test.ts.
class FakeQdrantClient {
    constructor(public options: Record<string, unknown>) {}
}
mock.module("@qdrant/js-client-rest", () => ({ QdrantClient: FakeQdrantClient }));

// The Qdrant hits the collection search returns. The fake client below serves the same rows through
// both `search` (which resolves to a bare array) and `query` (which wraps them in `{ points }`), so
// these tests describe what semanticSearchContent *returns* and stay valid across either client API.
type Hit = { id: string; score: number; payload?: Record<string, unknown> };

type SearchArgs = { vector?: number[]; limit?: number; offset?: number; with_payload?: boolean; filter?: unknown };

const createQdrantFake = (hitsByCollection: Record<string, Hit[]> = {}) => {
    const searchCalls: Array<{ collection: string; args: SearchArgs }> = [];
    const scrollCalls: Array<{ collection: string; args: SearchArgs }> = [];
    const hitsFor = (collection: string) => hitsByCollection[collection] ?? [];
    const page = (collection: string, args: SearchArgs) => {
        const offset = typeof args.offset === "number" ? args.offset : 0;
        return hitsFor(collection).slice(offset, args.limit === undefined ? undefined : offset + args.limit);
    };
    const client = {
        search: async (collection: string, args: SearchArgs) => {
            searchCalls.push({ collection, args });
            return page(collection, args);
        },
        query: async (collection: string, args: SearchArgs & { query?: number[] }) => {
            const { query, ...rest } = args;
            searchCalls.push({ collection, args: { ...rest, vector: query ?? rest.vector } });
            return { points: page(collection, args) };
        },
        scroll: async (collection: string, args: SearchArgs) => {
            scrollCalls.push({ collection, args });
            return { points: page(collection, args), next_page_offset: null };
        },
    };
    return { client, searchCalls, scrollCalls };
};

const createOpenAiFake = (embedding: number[] | null = [0.1, 0.2, 0.3]) => {
    const inputs: unknown[] = [];
    const client = {
        embeddings: {
            create: async (args: { input: string[]; model: string }) => {
                inputs.push(args);
                return { data: embedding === null ? [] : [{ embedding }] };
            },
        },
    };
    return { client, inputs };
};

const consoleSpy = silenceConsole("log", "info", "warn", "error");

// vdb.ts keeps the Qdrant/OpenAI clients and the "disabled" log flag in module-level state, so tests
// that depend on that state load their own instance of the module.
let instance = 0;
const loadVdb = async () => {
    instance += 1;
    return (await import(`./vdb?instance=${instance}`)) as typeof import("./vdb");
};

const search = async (
    vdb: typeof import("./vdb"),
    options: Partial<Parameters<typeof import("./vdb").semanticSearchContent>[0]> & {
        qdrant?: ReturnType<typeof createQdrantFake>["client"];
        openai?: ReturnType<typeof createOpenAiFake>["client"];
    } = {},
) => {
    const { qdrant, openai, ...rest } = options;
    return vdb.semanticSearchContent({
        query: "climate",
        categories: ["circles"],
        ...rest,
        dependencies: {
            getQdrantClient: (async () => qdrant ?? createQdrantFake().client) as never,
            getOpenAiClient: (() => openai ?? createOpenAiFake().client) as never,
            ...(rest.dependencies ?? {}),
        },
    });
};

beforeEach(() => {
    setEnv("VDB_ENABLED", undefined);
    setEnv("QDRANT_HOST", undefined);
    setEnv("OPENAI_API_KEY", "sk-test");
    consoleSpy.info.mockClear();
    consoleSpy.warn.mockClear();
    consoleSpy.error.mockClear();
});

describe("VDB_ENABLED gating", () => {
    test.each([undefined, "", "   ", "true", "TRUE", "1", "yes", "anything"])(
        "treats %p as enabled",
        async (flag) => {
            setEnv("VDB_ENABLED", flag);
            const vdb = await loadVdb();

            await expect(vdb.getQdrantClient()).resolves.toBeDefined();
        },
    );

    test.each(["false", "FALSE", "False", "0", "off", "OFF", "  off  "])("treats %p as disabled", async (flag) => {
        setEnv("VDB_ENABLED", flag);
        const vdb = await loadVdb();

        await expect(vdb.getQdrantClient()).rejects.toThrow(
            "Vector database features are disabled via VDB_ENABLED env variable.",
        );
    });

    test("names the rejection VdbDisabledError", async () => {
        setEnv("VDB_ENABLED", "false");
        const vdb = await loadVdb();

        await expect(vdb.getQdrantClient()).rejects.toMatchObject({ name: "VdbDisabledError" });
    });

    test("returns no results and logs the skip once when disabled", async () => {
        setEnv("VDB_ENABLED", "false");
        const vdb = await loadVdb();

        expect(await search(vdb)).toEqual([]);
        expect(await search(vdb)).toEqual([]);

        expect(consoleSpy.info).toHaveBeenCalledTimes(1);
        expect(consoleSpy.info).toHaveBeenCalledWith(
            "[VDB] Disabled locally – skipping semantic search. Set VDB_ENABLED=true to enable Qdrant/OpenAI features.",
        );
    });
});

describe("client construction", () => {
    test("reuses one Qdrant client across calls", async () => {
        const vdb = await loadVdb();

        expect(await vdb.getQdrantClient()).toBe(await vdb.getQdrantClient());
    });

    test("points the Qdrant client at the qdrant host by default", async () => {
        const vdb = await loadVdb();

        expect((await vdb.getQdrantClient()) as unknown as FakeQdrantClient).toMatchObject({
            options: { host: "qdrant", port: 6333, timeout: 30000 },
        });
    });

    test("honours QDRANT_HOST", async () => {
        setEnv("QDRANT_HOST", "qdrant.internal");
        const vdb = await loadVdb();

        expect((await vdb.getQdrantClient()) as unknown as FakeQdrantClient).toMatchObject({
            options: { host: "qdrant.internal" },
        });
    });

});

describe("semanticSearchContent", () => {
    test.each([
        ["an empty query", ""],
        ["a whitespace query", "   "],
    ])("returns no results for %s with no sdg handles", async (_label, query) => {
        const vdb = await loadVdb();

        expect(await search(vdb, { query })).toEqual([]);
    });

    test("maps a hit onto the mongo id, qdrant id and score", async () => {
        const vdb = await loadVdb();
        const mongoId = new ObjectId().toHexString();
        const { client } = createQdrantFake({
            circles: [{ id: "qdrant-1", score: 0.9, payload: { mongoId, circleType: "circle" } }],
        });

        expect(await search(vdb, { qdrant: client })).toEqual([
            { _id: mongoId, qdrantId: "qdrant-1", type: "circle", score: 0.9 },
        ]);
    });

    test.each([
        ["posts", { mongoId: "m" }, "post"],
        ["circles", { mongoId: "m", circleType: "user" }, "user"],
        ["circles", { mongoId: "m", circleType: "project" }, "project"],
        ["circles", { mongoId: "m" }, "circle"],
        ["tasks", { mongoId: "m" }, "circle"],
    ])("derives the type %p/%o as %p", async (collection, payload, expected) => {
        const vdb = await loadVdb();
        const { client } = createQdrantFake({ [collection]: [{ id: "q", score: 1, payload }] });

        const results = await search(vdb, { categories: [collection], qdrant: client });

        expect(results.map((result) => String(result.type))).toEqual([expected]);
    });

    test("skips an unknown collection and warns about it", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls } = createQdrantFake({
            circles: [{ id: "q", score: 1, payload: { mongoId: "m" } }],
        });

        const results = await search(vdb, { categories: ["nope", "circles"], qdrant: client });

        expect(results).toHaveLength(1);
        expect(searchCalls.map((call) => call.collection)).toEqual(["circles"]);
        expect(consoleSpy.warn).toHaveBeenCalledWith("Invalid collection name provided: nope");
    });

    test("sorts the combined results by descending score", async () => {
        const vdb = await loadVdb();
        const { client } = createQdrantFake({
            circles: [{ id: "low", score: 0.1, payload: { mongoId: "a" } }],
            posts: [{ id: "high", score: 0.8, payload: { mongoId: "b" } }],
        });

        const results = await search(vdb, { categories: ["circles", "posts"], qdrant: client });

        expect(results.map((result) => result.qdrantId)).toEqual(["high", "low"]);
    });

    test("caps the combined results at the given limit", async () => {
        const vdb = await loadVdb();
        const { client } = createQdrantFake({
            circles: [
                { id: "a", score: 0.9, payload: { mongoId: "a" } },
                { id: "b", score: 0.8, payload: { mongoId: "b" } },
                { id: "c", score: 0.7, payload: { mongoId: "c" } },
            ],
        });

        const results = await search(vdb, { qdrant: client, limit: 2 });

        expect(results.map((result) => result.qdrantId)).toEqual(["a", "b"]);
    });

    test("asks the collection for the payload and the requested limit", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls } = createQdrantFake({ circles: [] });

        await search(vdb, { qdrant: client, limit: 7 });

        expect(searchCalls[0].args).toMatchObject({ limit: 7, with_payload: true });
    });

    test("defaults the limit to 20", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls } = createQdrantFake({ circles: [] });

        await search(vdb, { qdrant: client });

        expect(searchCalls[0].args.limit).toBe(20);
    });

    test("searches with the embedding produced for the query", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls } = createQdrantFake({ circles: [] });
        const { client: openai, inputs } = createOpenAiFake([0.4, 0.5]);

        await search(vdb, { qdrant: client, openai, query: "climate" });

        expect(inputs).toEqual([{ input: ["climate"], model: "text-embedding-3-small" }]);
        expect(searchCalls[0].args.vector).toEqual([0.4, 0.5]);
    });

    test("turns sdg handles into a causes filter", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls } = createQdrantFake({ circles: [] });

        await search(vdb, { qdrant: client, sdgHandles: ["no-poverty", "zero-hunger"] });

        expect(searchCalls[0].args.filter).toEqual({
            must: [{ key: "causes", match: { any: ["no-poverty", "zero-hunger"] } }],
        });
    });

    test("sends an empty filter when no sdg handles are given", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls } = createQdrantFake({ circles: [] });

        await search(vdb, { qdrant: client });

        expect(searchCalls[0].args.filter).toEqual({});
    });

    test("scrolls instead of searching when there is no query but there are sdg handles", async () => {
        const vdb = await loadVdb();
        const { client, searchCalls, scrollCalls } = createQdrantFake({
            circles: [{ id: "q", score: 0.5, payload: { mongoId: "m" } }],
        });

        const results = await search(vdb, { qdrant: client, query: "", sdgHandles: ["no-poverty"] });

        expect(searchCalls).toHaveLength(0);
        expect(scrollCalls[0]).toMatchObject({
            collection: "circles",
            args: { limit: 20, with_payload: true },
        });
        expect(results).toEqual([{ _id: "m", qdrantId: "q", type: "circle", score: 0.5 }]);
    });

    test("returns no results and logs when the query embedding is missing", async () => {
        const vdb = await loadVdb();
        const { client: openai } = createOpenAiFake(null);

        expect(await search(vdb, { openai })).toEqual([]);
        expect(consoleSpy.error).toHaveBeenCalledWith("Failed to generate embedding for the query.");
    });

    test("swallows a failing search, logs it and returns no results", async () => {
        const vdb = await loadVdb();
        const failure = new Error("qdrant down");
        const client = { search: async () => { throw failure; }, query: async () => { throw failure; } };

        expect(await search(vdb, { qdrant: client as never })).toEqual([]);
        expect(consoleSpy.error).toHaveBeenCalledWith("Error during semantic search:", failure);
    });
});

describe("semanticSearchContent event results", () => {
    const hostId = new ObjectId();

    const eventDependencies = (readableIds: string[]) => ({
        findEvents: async (ids: ObjectId[]) =>
            ids.map((id) => ({
                _id: id,
                circleId: hostId.toHexString(),
                visibility: "public",
                createdBy: "did:author",
            })) as never,
        findPrivateEntitledEventIds: async () => readableIds,
        hostPolicyDependencies: {
            findCircles: async () =>
                [{ _id: hostId, circleType: "circle", visibility: "public", moderationStatus: "active" }] as never,
            findMemberships: async () => [],
        },
    });

    test("returns event hits revalidated through the event read policy", async () => {
        const vdb = await loadVdb();
        const eventId = new ObjectId().toHexString();
        const { client } = createQdrantFake({
            events: [{ id: "q-event", score: 0.6, payload: { mongoId: eventId } }],
        });

        const results = await search(vdb, {
            categories: ["events"],
            qdrant: client,
            dependencies: { eventPolicyDependencies: eventDependencies([eventId]) } as never,
        });

        expect(results).toEqual([{ _id: eventId, qdrantId: "q-event", type: "event", score: 0.6 }]);
    });
});

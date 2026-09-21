import { describe, expect, test } from "bun:test";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

// The parts of the real Qdrant and OpenAI clients that src/lib/data/vdb.ts and
// src/components/onboarding/actions.ts call. vdb.test.ts replaces both clients with fakes, so
// without this file an upgrade could remove a method and every other test would still pass.
//
// QdrantClient is checked through its prototype rather than an instance: constructing one fires a
// server version check that cannot succeed in a test run.

describe("QdrantClient", () => {
    test.each(["query", "scroll", "upsert", "retrieve", "delete", "count", "createCollection", "getCollections"])(
        "exposes %p",
        (method) => {
            expect(typeof (QdrantClient.prototype as unknown as Record<string, unknown>)[method]).toBe("function");
        },
    );

    test("no longer exposes the removed search method", () => {
        expect((QdrantClient.prototype as unknown as Record<string, unknown>).search).toBeUndefined();
    });
});

describe("OpenAI", () => {
    // dangerouslyAllowBrowser is set only because the test preload registers happy-dom globals; the
    // application constructs its client without it.
    const client = new OpenAI({ apiKey: "sk-test", dangerouslyAllowBrowser: true });

    test("creates embeddings through embeddings.create", () => {
        expect(typeof client.embeddings.create).toBe("function");
    });

    test("accepts the apiKey option used by getOpenAiClient", () => {
        expect(client.apiKey).toBe("sk-test");
    });
});

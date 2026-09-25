import assert from "node:assert/strict";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock } from "bun:test";

let shouldThrow = false;
let lastViewerDid: string | undefined;

mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => "did:member",
}));
mock.module("@/lib/auth/authenticated-viewer", () => ({
    resolveAuthenticatedViewerDid: async () => "did:member",
}));
mock.module("@/lib/data/search", () => ({
    searchDiscoverableCircles: async ({ viewerDid }: { viewerDid?: string }) => {
        lastViewerDid = viewerDid;
        if (shouldThrow) throw new Error("expected search failure");
        return [{ name: "Public result" }];
    },
}));

const { GET } = await import("./route");
const request = (query: string) => new Request(`http://localhost/api/circles/search${query}`) as never;

const emptyResponse = await GET(request(""));
assert.equal(emptyResponse.status, 200);
assert.equal(emptyResponse.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await emptyResponse.json(), { circles: [] });

const successResponse = await GET(request("?q=public"));
assert.equal(successResponse.status, 200);
assert.equal(successResponse.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await successResponse.json(), { circles: [{ name: "Public result" }] });
assert.equal(lastViewerDid, "did:member", "the route preserves viewer-aware Secret Circle discovery");

shouldThrow = true;
const originalConsoleError = console.error;
console.error = () => undefined;
const errorResponse = await GET(request("?q=failure"));
console.error = originalConsoleError;
assert.equal(errorResponse.status, 500);
assert.equal(errorResponse.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await errorResponse.json(), { circles: [] });

console.log("public Circle search API cache tests passed");

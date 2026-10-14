import assert from "node:assert/strict";
// @ts-expect-error Bun provides module types at runtime; this repository does not install them.
import { test } from "bun:test";
import { getOptimizedImageUrl } from "./map-image-url";

test("private media map images bypass Next image optimization", () => {
    const url = "/private-media/0123456789abcdef01234567";
    assert.equal(getOptimizedImageUrl(url, 64, 60), url);
});

test("public storage map images retain Next image optimization", () => {
    assert.equal(
        getOptimizedImageUrl("/storage/circle/avatar.png", 64, 60),
        "/_next/image?url=%2Fstorage%2Fcircle%2Favatar.png&w=64&q=60",
    );
});

test("public remote and bundled local map images retain Next image optimization", () => {
    assert.equal(
        getOptimizedImageUrl("https://cdn.example.test/avatar.png", 384, 72),
        "/_next/image?url=https%3A%2F%2Fcdn.example.test%2Favatar.png&w=384&q=72",
    );
    assert.equal(
        getOptimizedImageUrl("/images/default-user-cover.png", 384, 72),
        "/_next/image?url=%2Fimages%2Fdefault-user-cover.png&w=384&q=72",
    );
});

test("data, blob, and already optimized map image URLs remain unchanged", () => {
    const urls = [
        "data:image/png;base64,cG5n",
        "blob:https://kamooni.org/01234567-89ab-cdef-0123-456789abcdef",
        "/_next/image?url=%2Fstorage%2Fcircle%2Favatar.png&w=64&q=60",
    ];

    for (const url of urls) {
        assert.equal(getOptimizedImageUrl(url, 384, 72), url);
    }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error Bun provides module types at runtime; this repository does not install them.
import { test } from "bun:test";
import { shouldUnoptimizeCircleAvatar } from "./circle-avatar-image";

test("private Circle avatars bypass Next Image optimization", () => {
    assert.equal(shouldUnoptimizeCircleAvatar("/private-media/0123456789abcdef01234567"), true);
});

test("public storage Circle avatars retain Next Image optimization", () => {
    assert.equal(shouldUnoptimizeCircleAvatar("/storage/circle/avatar.png"), false);
});

test("default local Circle avatars retain Next Image optimization", () => {
    assert.equal(shouldUnoptimizeCircleAvatar("/images/default-picture.png"), false);
});

test("Circle Next Image avatar renderers pass the private-media decision to unoptimized", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const renderers = [
        "components/modules/home/editable-image.tsx",
        "components/modules/home/home-content.tsx",
        "components/layout/content-preview.tsx",
        "components/layout/circle-menu.tsx",
        "components/modules/circles/circles-list.tsx",
    ];

    for (const renderer of renderers) {
        const source = await readFile(path.join(root, renderer), "utf8");
        assert.match(
            source,
            /unoptimized=\{shouldUnoptimizeCircleAvatar\(/,
            `${renderer} must pass the private-media decision to Next Image`,
        );
    }
});

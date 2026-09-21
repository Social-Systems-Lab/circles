// Shared assertions for Next.js route modules.

import { expect, test } from "bun:test";

/**
 * Registers the standard check for API routes that must run on the Node runtime and are never statically
 * cached. Call it inside a `describe` block with the imported route module.
 */
export function testNodeRuntimeRoute(route: { runtime?: string; dynamic?: string }): void {
    test("runs on the node runtime and is never statically cached", () => {
        expect(route.runtime).toBe("nodejs");
        expect(route.dynamic).toBe("force-dynamic");
    });
}

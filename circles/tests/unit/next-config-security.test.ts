import { describe, expect, test } from "bun:test";

describe("Next.js security configuration", () => {
    test("does not allow wildcard remote image optimization hosts", async () => {
        const { default: nextConfig } = await import("../../next.config.mjs");
        const remotePatterns = nextConfig.images?.remotePatterns ?? [];

        expect(remotePatterns.length).toBeGreaterThan(0);
        expect(remotePatterns.some((pattern: { hostname?: string }) => pattern.hostname === "**")).toBe(false);
        expect(remotePatterns.some((pattern: { hostname?: string }) => pattern.hostname === "kamooni.org")).toBe(true);
    });

    test("sets baseline browser security headers", async () => {
        const { default: nextConfig } = await import("../../next.config.mjs");
        const headerRules = await nextConfig.headers();
        const allHeaders = new Map(headerRules.flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers.map((header) => [header.key, header.value])));

        expect(allHeaders.get("X-Content-Type-Options")).toBe("nosniff");
        expect(allHeaders.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
        expect(allHeaders.get("X-Frame-Options")).toBe("DENY");
        expect(allHeaders.has("Permissions-Policy")).toBe(true);
    });
});

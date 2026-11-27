import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveSafeNotificationUrl } from "./notification-click-url";
import { getInstallGuidanceMode, isIosOrIpadOs, isStandaloneDisplayMode } from "./install-state";

const appRoot = path.resolve(import.meta.dirname, "../../..");

function readPngDimensions(filePath: string): { width: number; height: number } {
    const buf = fs.readFileSync(filePath);
    const pngSig = "89504e470d0a1a0a";
    assert.equal(buf.subarray(0, 8).toString("hex"), pngSig, `${filePath} must be a valid PNG`);
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
    };
}

describe("PWA manifest and icons", () => {
    it("provides a valid web app manifest with stable identity and Kamooni brand colors", () => {
        const manifestPath = path.join(appRoot, "public", "manifest.webmanifest");
        const raw = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(raw);

        assert.equal(manifest.id, "/");
        assert.equal(manifest.name, "Kamooni");
        assert.equal(manifest.short_name, "Kamooni");
        assert.equal(manifest.start_url, "/");
        assert.equal(manifest.scope, "/");
        assert.equal(manifest.display, "standalone");
        assert.equal(manifest.background_color, "#fbfbfb");
        assert.equal(manifest.theme_color, "#346f4c");
        assert.ok(Array.isArray(manifest.icons) && manifest.icons.length === 3);

        const bySrc = new Map<string, any>(manifest.icons.map((icon: any) => [icon.src, icon]));
        assert.equal(bySrc.get("/icons/192.png")?.sizes, "192x192");
        assert.equal(bySrc.get("/icons/192.png")?.purpose, "any");
        assert.equal(bySrc.get("/icons/512.png")?.sizes, "512x512");
        assert.equal(bySrc.get("/icons/512.png")?.purpose, "any");
        assert.equal(bySrc.get("/icons/maskable.png")?.sizes, "512x512");
        assert.equal(bySrc.get("/icons/maskable.png")?.purpose, "maskable");
    });

    it("provides crisp PNG icons at required exact dimensions", () => {
        const expected: Array<[string, number, number]> = [
            ["public/icons/192.png", 192, 192],
            ["public/icons/512.png", 512, 512],
            ["public/icons/maskable.png", 512, 512],
            ["public/icons/apple-180.png", 180, 180],
            ["public/icons/badge-96.png", 96, 96],
        ];

        for (const [relPath, width, height] of expected) {
            const dims = readPngDimensions(path.join(appRoot, relPath));
            assert.deepEqual(dims, { width, height }, `${relPath} dimensions mismatch`);
        }
    });
});

describe("Service worker privacy and structure", () => {
    it("does not cache private data or intercept fetch requests", () => {
        const swSource = fs.readFileSync(path.join(appRoot, "public", "sw.js"), "utf8");

        assert.doesNotMatch(swSource, /addEventListener\(\s*["']fetch["']/);
        assert.doesNotMatch(swSource, /\bcaches\s*\./);
        assert.doesNotMatch(swSource, /\bCacheStorage\b/);
        assert.match(swSource, /addEventListener\(\s*["']push["']/);
        assert.match(swSource, /addEventListener\(\s*["']notificationclick["']/);
        assert.match(swSource, /You have a new update on Kamooni\./);
    });
});

describe("Notification click URL allowlist", () => {
    const origin = "https://staging.kamooni.org";

    it("accepts allowlisted relative Kamooni routes", () => {
        assert.equal(resolveSafeNotificationUrl("/chat/abc123?topic=t1", origin), "/chat/abc123?topic=t1");
        assert.equal(resolveSafeNotificationUrl("/circles/demo/events/e1", origin), "/circles/demo/events/e1");
        assert.equal(resolveSafeNotificationUrl("/secret-invitations/inv1", origin), "/secret-invitations/inv1");
        assert.equal(resolveSafeNotificationUrl("https://staging.kamooni.org/admin?tab=users", origin), "/admin?tab=users");
        assert.equal(resolveSafeNotificationUrl("/", origin), "/");
    });

    it("rejects external origins, protocol-relative URLs, scripts, and private/API paths", () => {
        assert.equal(resolveSafeNotificationUrl("https://evil.example/chat/1", origin), "/");
        assert.equal(resolveSafeNotificationUrl("//evil.example/chat/1", origin), "/");
        assert.equal(resolveSafeNotificationUrl("javascript:alert(1)", origin), "/");
        assert.equal(resolveSafeNotificationUrl("/api/notifications", origin), "/");
        assert.equal(resolveSafeNotificationUrl("/private-media/secret", origin), "/");
        assert.equal(resolveSafeNotificationUrl("/chat/1\nLocation: https://evil.example", origin), "/");
        assert.equal(resolveSafeNotificationUrl(null, origin), "/");
    });
});

describe("PWA install guidance helpers", () => {
    it("detects iOS and iPadOS desktop-class browsers", () => {
        assert.equal(isIosOrIpadOs({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)" }), true);
        assert.equal(
            isIosOrIpadOs({
                userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                platform: "MacIntel",
                maxTouchPoints: 5,
            }),
            true,
        );
        assert.equal(
            isIosOrIpadOs({
                userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                platform: "MacIntel",
                maxTouchPoints: 0,
            }),
            false,
        );
    });

    it("detects standalone mode and chooses appropriate install guidance", () => {
        assert.equal(isStandaloneDisplayMode({ navigator: { standalone: true } }), true);
        assert.equal(
            isStandaloneDisplayMode({ matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }) }),
            true,
        );

        assert.equal(
            getInstallGuidanceMode({ isStandalone: true, hasDeferredPrompt: true, isIos: true, isSupported: true }),
            "installed",
        );
        assert.equal(
            getInstallGuidanceMode({ isStandalone: false, hasDeferredPrompt: true, isIos: false, isSupported: true }),
            "prompt",
        );
        assert.equal(
            getInstallGuidanceMode({ isStandalone: false, hasDeferredPrompt: false, isIos: true, isSupported: true }),
            "ios_manual",
        );
        assert.equal(
            getInstallGuidanceMode({ isStandalone: false, hasDeferredPrompt: false, isIos: false, isSupported: true }),
            "browser_manual",
        );
        assert.equal(
            getInstallGuidanceMode({ isStandalone: false, hasDeferredPrompt: false, isIos: false, isSupported: false }),
            "unsupported",
        );
    });
});

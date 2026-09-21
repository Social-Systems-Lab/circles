import { describe, expect, test } from "bun:test";
import { inferSocialPlatformFromUrl, normalizeSocialLinkUrl, sanitizeSocialLinks } from "./social-links";

describe("normalizeSocialLinkUrl", () => {
    test("returns undefined for non-string values", () => {
        for (const value of [undefined, null, 42, {}, [], true]) {
            expect(normalizeSocialLinkUrl(value)).toBeUndefined();
        }
    });

    test("returns undefined for empty or whitespace-only strings", () => {
        expect(normalizeSocialLinkUrl("")).toBeUndefined();
        expect(normalizeSocialLinkUrl("   \n\t")).toBeUndefined();
    });

    test("keeps http and https URLs and adds the trailing slash", () => {
        expect(normalizeSocialLinkUrl("https://example.com")).toBe("https://example.com/");
        expect(normalizeSocialLinkUrl("http://example.com/path?x=1")).toBe("http://example.com/path?x=1");
    });

    test("prefixes https:// when no scheme is present", () => {
        expect(normalizeSocialLinkUrl("example.com/profile")).toBe("https://example.com/profile");
    });

    test("trims surrounding whitespace", () => {
        expect(normalizeSocialLinkUrl("  https://example.com/a  ")).toBe("https://example.com/a");
    });

    test("treats the scheme case-insensitively", () => {
        expect(normalizeSocialLinkUrl("HTTPS://Example.com/A")).toBe("https://example.com/A");
    });

    test("rejects non-http(s) schemes", () => {
        expect(normalizeSocialLinkUrl("ftp://example.com")).toBeUndefined();
        expect(normalizeSocialLinkUrl("javascript://example.com/%0Aalert(1)")).toBeUndefined();
        expect(normalizeSocialLinkUrl("mailto://someone@example.com")).toBeUndefined();
    });

    test("prefixes schemes that have no // authority marker, then rejects the malformed result", () => {
        // `javascript:alert(1)` has no `://`, so it is treated as a bare host and becomes an invalid URL
        expect(normalizeSocialLinkUrl("javascript:alert(1)")).toBeUndefined();
    });

    test("rejects unparseable input", () => {
        expect(normalizeSocialLinkUrl("http://")).toBeUndefined();
        expect(normalizeSocialLinkUrl("https://exa mple.com")).toBeUndefined();
    });
});

describe("inferSocialPlatformFromUrl", () => {
    test.each([
        ["https://facebook.com/someone", "facebook"],
        ["https://www.facebook.com/someone", "facebook"],
        ["https://youtube.com/@channel", "youtube"],
        ["https://youtu.be/abc123", "youtube"],
        ["https://m.youtube.com/watch?v=x", "youtube"],
        ["https://instagram.com/someone", "instagram"],
        ["https://www.linkedin.com/in/someone", "linkedin"],
        ["https://twitter.com/someone", "twitter"],
        ["https://x.com/someone", "twitter"],
        ["https://mobile.x.com/someone", "twitter"],
    ])("%s is %s", (url, platform) => {
        expect(inferSocialPlatformFromUrl(url)).toBe(platform);
    });

    test("is case-insensitive about the hostname", () => {
        expect(inferSocialPlatformFromUrl("https://WWW.Instagram.COM/x")).toBe("instagram");
    });

    test("does not match hosts that merely end with the domain text", () => {
        expect(inferSocialPlatformFromUrl("https://notfacebook.com")).toBeUndefined();
        expect(inferSocialPlatformFromUrl("https://fakex.com")).toBeUndefined();
        expect(inferSocialPlatformFromUrl("https://facebook.com.evil.example")).toBeUndefined();
    });

    test("returns undefined for unknown hosts", () => {
        expect(inferSocialPlatformFromUrl("https://example.com")).toBeUndefined();
    });

    test("returns undefined for values that are not URLs", () => {
        expect(inferSocialPlatformFromUrl("not a url")).toBeUndefined();
        expect(inferSocialPlatformFromUrl("")).toBeUndefined();
        expect(inferSocialPlatformFromUrl("facebook.com/someone")).toBeUndefined();
    });
});

describe("sanitizeSocialLinks", () => {
    test("returns an empty array when the input is not an array", () => {
        for (const value of [undefined, null, "https://x.com", {}, 5]) {
            expect(sanitizeSocialLinks(value)).toEqual([]);
        }
    });

    test("returns an empty array for an empty list", () => {
        expect(sanitizeSocialLinks([])).toEqual([]);
    });

    test("keeps well-formed entries", () => {
        expect(sanitizeSocialLinks([{ platform: "twitter", url: "https://twitter.com/me" }])).toEqual([
            { platform: "twitter", url: "https://twitter.com/me" },
        ]);
    });

    test("normalizes the platform to trimmed lowercase", () => {
        expect(sanitizeSocialLinks([{ platform: "  Mastodon ", url: "https://mastodon.social/@me" }])).toEqual([
            { platform: "mastodon", url: "https://mastodon.social/@me" },
        ]);
    });

    test("normalizes bare URLs", () => {
        expect(sanitizeSocialLinks([{ platform: "web", url: "example.com/me" }])).toEqual([
            { platform: "web", url: "https://example.com/me" },
        ]);
    });

    test("infers the platform from the URL when it is missing or blank", () => {
        expect(sanitizeSocialLinks([{ url: "https://x.com/me" }, { platform: "   ", url: "instagram.com/me" }])).toEqual([
            { platform: "twitter", url: "https://x.com/me" },
            { platform: "instagram", url: "https://instagram.com/me" },
        ]);
    });

    test("prefers an explicit platform over the inferred one", () => {
        expect(sanitizeSocialLinks([{ platform: "custom", url: "https://x.com/me" }])).toEqual([
            { platform: "custom", url: "https://x.com/me" },
        ]);
    });

    test("drops entries whose platform is missing and cannot be inferred", () => {
        expect(sanitizeSocialLinks([{ url: "https://example.com/me" }])).toEqual([]);
    });

    test("drops entries with an invalid or missing URL", () => {
        expect(
            sanitizeSocialLinks([
                { platform: "twitter" },
                { platform: "twitter", url: "" },
                { platform: "twitter", url: 12 },
                { platform: "twitter", url: "ftp://example.com" },
            ]),
        ).toEqual([]);
    });

    test("drops non-object entries", () => {
        expect(sanitizeSocialLinks([null, undefined, "https://x.com/me", 5, false])).toEqual([]);
    });

    test("ignores a non-string platform and falls back to inference", () => {
        expect(sanitizeSocialLinks([{ platform: 7, url: "https://youtu.be/abc" }])).toEqual([
            { platform: "youtube", url: "https://youtu.be/abc" },
        ]);
    });

    test("strips unknown extra properties", () => {
        expect(sanitizeSocialLinks([{ platform: "twitter", url: "https://x.com/me", extra: "x" }])).toEqual([
            { platform: "twitter", url: "https://x.com/me" },
        ]);
    });

    test("keeps valid entries and drops invalid ones from a mixed list, preserving order", () => {
        expect(
            sanitizeSocialLinks([
                { platform: "twitter", url: "https://x.com/a" },
                { platform: "bad", url: "nope://" },
                null,
                { url: "https://facebook.com/b" },
            ]),
        ).toEqual([
            { platform: "twitter", url: "https://x.com/a" },
            { platform: "facebook", url: "https://facebook.com/b" },
        ]);
    });
});

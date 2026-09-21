import { describe, expect, test } from "bun:test";
import { socialPlatforms } from "./social";

describe("socialPlatforms", () => {
    test("lists the supported platforms in display order", () => {
        expect(socialPlatforms.map((platform) => platform.handle)).toEqual([
            "twitter",
            "linkedin",
            "github",
            "facebook",
            "instagram",
            "youtube",
        ]);
    });

    test("gives each platform a name and handle", () => {
        expect(socialPlatforms.map((platform) => platform.name)).toEqual([
            "Twitter",
            "LinkedIn",
            "GitHub",
            "Facebook",
            "Instagram",
            "YouTube",
        ]);
    });

    test("has unique handles", () => {
        expect(new Set(socialPlatforms.map((platform) => platform.handle)).size).toBe(socialPlatforms.length);
    });

    test("provides a renderable icon component for every platform", () => {
        for (const platform of socialPlatforms) {
            expect(typeof platform.icon).toBe("function");
        }
    });

    test("uses a different icon for every platform", () => {
        expect(new Set(socialPlatforms.map((platform) => platform.icon)).size).toBe(socialPlatforms.length);
    });
});

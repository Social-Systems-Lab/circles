import { describe, expect, test } from "bun:test";
import { getCircleDefaultPath, getDefaultCircleModule } from "./circle-routes";

describe("getDefaultCircleModule", () => {
    test("prefers the home module when it is enabled", () => {
        expect(getDefaultCircleModule(["feed", "home", "settings"])).toBe("home");
    });

    test("falls back to the first enabled module when home is not enabled", () => {
        expect(getDefaultCircleModule(["feed", "settings"])).toBe("feed");
    });

    test("falls back to home when no modules are enabled", () => {
        expect(getDefaultCircleModule([])).toBe("home");
    });

    test("falls back to home when the module list is undefined", () => {
        expect(getDefaultCircleModule(undefined)).toBe("home");
        expect(getDefaultCircleModule()).toBe("home");
    });

    test("matches home exactly rather than by prefix", () => {
        expect(getDefaultCircleModule(["homepage", "feed"])).toBe("homepage");
    });
});

describe("getCircleDefaultPath", () => {
    test("builds the circle path from the handle and default module", () => {
        expect(getCircleDefaultPath({ handle: "my-circle", enabledModules: ["feed", "home"] })).toBe(
            "/circles/my-circle/home",
        );
    });

    test("uses the first enabled module when home is disabled", () => {
        expect(getCircleDefaultPath({ handle: "my-circle", enabledModules: ["goals", "tasks"] })).toBe(
            "/circles/my-circle/goals",
        );
    });

    test("defaults to home without enabled modules", () => {
        expect(getCircleDefaultPath({ handle: "my-circle" })).toBe("/circles/my-circle/home");
    });

    test("does not encode or validate the handle", () => {
        expect(getCircleDefaultPath({ handle: "a b/c", enabledModules: [] })).toBe("/circles/a b/c/home");
    });
});

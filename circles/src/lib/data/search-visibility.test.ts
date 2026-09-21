import { describe, expect, test } from "bun:test";
import type { Circle, CircleType } from "@/models/models";
import { buildSearchableTypeClauses, isSearchEligibleCircle } from "./search-visibility";

describe("isSearchEligibleCircle", () => {
    test.each(["circle", "user", "project"])("is true for a %s", (circleType) => {
        expect(isSearchEligibleCircle({ circleType } as Circle)).toBe(true);
    });

    test("is false without a circle type", () => {
        expect(isSearchEligibleCircle({} as Circle)).toBe(false);
        expect(isSearchEligibleCircle({ circleType: undefined } as Circle)).toBe(false);
        expect(isSearchEligibleCircle({ circleType: "" as CircleType } as Circle)).toBe(false);
    });
});

describe("buildSearchableTypeClauses", () => {
    test("returns no clauses for no types", () => {
        expect(buildSearchableTypeClauses([])).toEqual([]);
    });

    test("groups non-user types into one $in clause", () => {
        expect(buildSearchableTypeClauses(["circle", "project"])).toEqual([{ circleType: { $in: ["circle", "project"] } }]);
    });

    test("matches users with an exact clause rather than $in", () => {
        expect(buildSearchableTypeClauses(["user"])).toEqual([{ circleType: "user" }]);
    });

    test("puts the non-user clause before the user clause", () => {
        expect(buildSearchableTypeClauses(["user", "circle"])).toEqual([
            { circleType: { $in: ["circle"] } },
            { circleType: "user" },
        ]);
    });

    test("keeps the order of the non-user types", () => {
        expect(buildSearchableTypeClauses(["project", "user", "circle"])[0]).toEqual({
            circleType: { $in: ["project", "circle"] },
        });
    });

    test("does not deduplicate repeated types", () => {
        expect(buildSearchableTypeClauses(["circle", "circle", "user", "user"])).toEqual([
            { circleType: { $in: ["circle", "circle"] } },
            { circleType: "user" },
        ]);
    });

    test("does not mutate its input", () => {
        const types: CircleType[] = ["user", "circle"];

        buildSearchableTypeClauses(types);

        expect(types).toEqual(["user", "circle"]);
    });
});

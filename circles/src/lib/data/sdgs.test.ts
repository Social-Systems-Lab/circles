import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sdgs } from "./sdgs";

const publicDir = join(import.meta.dir, "../../../public");

describe("sdgs", () => {
    test("lists the 17 Sustainable Development Goals in order", () => {
        expect(sdgs).toHaveLength(17);
        expect(sdgs.map((sdg) => sdg.handle)).toEqual(Array.from({ length: 17 }, (_, index) => `sdg-${index + 1}`));
    });

    test("uses the handle as the id", () => {
        for (const sdg of sdgs) expect(sdg._id).toBe(sdg.handle);
    });

    test("has unique handles and names", () => {
        expect(new Set(sdgs.map((sdg) => sdg.handle)).size).toBe(17);
        expect(new Set(sdgs.map((sdg) => sdg.name)).size).toBe(17);
    });

    test("gives every goal a name and a description", () => {
        for (const sdg of sdgs) {
            expect(sdg.name.trim()).not.toBe("");
            expect(sdg.description?.trim()).toBeTruthy();
        }
    });

    test("names the well-known first and last goals", () => {
        expect(sdgs[0].name).toBe("No Poverty");
        expect(sdgs[1].name).toBe("Zero Hunger");
        expect(sdgs[16].name).toBe("Partnerships for the Goals");
    });

    test("points every goal at a zero-padded goal image", () => {
        sdgs.forEach((sdg, index) => {
            expect(sdg.picture?.url).toBe(`/images/sdgs/Goal-${String(index + 1).padStart(2, "0")}.png`);
        });
    });

    test("only references images that exist in the public folder", () => {
        for (const sdg of sdgs) {
            expect(existsSync(join(publicDir, sdg.picture!.url))).toBe(true);
        }
    });
});

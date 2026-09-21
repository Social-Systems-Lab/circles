import { describe, expect, test } from "bun:test";
import { getInterestLabel, interestOptions } from "./interests";

describe("interestOptions", () => {
    test("offers 18 interests", () => {
        expect(interestOptions).toHaveLength(18);
    });

    test("uses unique kebab-case values", () => {
        const values = interestOptions.map((option) => option.value);

        expect(new Set(values).size).toBe(values.length);
        for (const value of values) expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });

    test("has a non-empty, unique label for each option", () => {
        const labels = interestOptions.map((option) => option.label);

        expect(new Set(labels).size).toBe(labels.length);
        for (const label of labels) expect(label.trim()).not.toBe("");
    });
});

describe("getInterestLabel", () => {
    test.each(interestOptions.map((option) => [option.value, option.label]))("maps %s to its label %s", (value, label) => {
        expect(getInterestLabel(value)).toBe(label);
    });

    test("uses the curated label rather than a generated one", () => {
        expect(getInterestLabel("arts-culture")).toBe("Arts / culture");
        expect(getInterestLabel("open-source")).toBe("Open source");
    });

    test("derives a title-cased label for unknown interests", () => {
        expect(getInterestLabel("deep-sea-diving")).toBe("Deep Sea Diving");
        expect(getInterestLabel("gardening")).toBe("Gardening");
    });

    test("only capitalizes the first letter of each part", () => {
        expect(getInterestLabel("ai-and-ML")).toBe("Ai And ML");
    });

    test("handles empty values and repeated separators", () => {
        expect(getInterestLabel("")).toBe("");
        expect(getInterestLabel("a--b")).toBe("A  B");
    });

    test("does not normalize case when looking up known values", () => {
        expect(getInterestLabel("Climate")).toBe("Climate");
        expect(getInterestLabel("CLIMATE")).toBe("CLIMATE");
    });
});

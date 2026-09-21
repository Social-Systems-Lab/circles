import { describe, expect, test } from "bun:test";
import { parseEventHostCircleIds, uniqueEventHostIds } from "./event-host-input";

const INVALID = "__invalid_event_host_structure__";

const formOf = (...values: (string | Blob)[]) => {
    const formData = new FormData();
    for (const value of values) formData.append("hostCircleIds", value);
    return formData;
};

describe("uniqueEventHostIds", () => {
    test("keeps the first occurrence of each id, in order", () => {
        expect(uniqueEventHostIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
    });

    test("drops non-strings", () => {
        expect(uniqueEventHostIds(["a", 1, null, undefined, {}, ["b"], true])).toEqual(["a"]);
    });

    test("drops empty and whitespace-only strings", () => {
        expect(uniqueEventHostIds(["", "  ", "\n", "a"])).toEqual(["a"]);
    });

    test("does not trim ids that have content", () => {
        expect(uniqueEventHostIds([" a", "a"])).toEqual([" a", "a"]);
    });

    test("returns an empty array for empty input", () => {
        expect(uniqueEventHostIds([])).toEqual([]);
    });
});

describe("parseEventHostCircleIds", () => {
    test("returns just the primary circle when no hosts were submitted", () => {
        expect(parseEventHostCircleIds(new FormData(), "primary")).toEqual(["primary"]);
    });

    test("puts the primary circle first, followed by the submitted hosts", () => {
        expect(parseEventHostCircleIds(formOf(JSON.stringify(["a", "b"])), "primary")).toEqual(["primary", "a", "b"]);
    });

    test("does not duplicate the primary circle when it is also submitted", () => {
        expect(parseEventHostCircleIds(formOf(JSON.stringify(["a", "primary", "a"])), "primary")).toEqual(["primary", "a"]);
    });

    test("combines several hostCircleIds entries", () => {
        expect(parseEventHostCircleIds(formOf(JSON.stringify(["a"]), JSON.stringify(["b", "a"])), "primary")).toEqual([
            "primary",
            "a",
            "b",
        ]);
    });

    test("ignores blank entries", () => {
        expect(parseEventHostCircleIds(formOf("", "   "), "primary")).toEqual(["primary"]);
    });

    test("ignores an empty JSON list", () => {
        expect(parseEventHostCircleIds(formOf("[]"), "primary")).toEqual(["primary"]);
    });

    test("passes a value that is not JSON through as a single id", () => {
        expect(parseEventHostCircleIds(formOf("some-circle-id"), "primary")).toEqual(["primary", "some-circle-id"]);
    });

    describe("malformed structures are kept as a marker so the host policy can deny them", () => {
        test.each([
            ["a JSON object", '{"a":1}'],
            ["a JSON string", '"a"'],
            ["a JSON number", "5"],
            ["JSON null", "null"],
            ["a list with non-strings", '["a", 1]'],
            ["a list with null", '["a", null]'],
            ["a nested list", '[["a"]]'],
            ["a list with a blank id", '["a", ""]'],
            ["a list with a whitespace id", '["a", "  "]'],
        ])("%s", (_label, raw) => {
            expect(parseEventHostCircleIds(formOf(raw), "primary")).toEqual(["primary", INVALID]);
        });

        test("a file upload under the same field name", () => {
            expect(parseEventHostCircleIds(formOf(new File(["x"], "x.txt")), "primary")).toEqual(["primary", INVALID]);
        });

        test("does not let valid entries mask an invalid one", () => {
            expect(parseEventHostCircleIds(formOf(JSON.stringify(["a"]), '{"bad":true}'), "primary")).toEqual([
                "primary",
                "a",
                INVALID,
            ]);
        });

        test("only records the marker once", () => {
            expect(parseEventHostCircleIds(formOf("5", "null", "{}"), "primary")).toEqual(["primary", INVALID]);
        });
    });

    test("ignores other form fields", () => {
        const formData = formOf(JSON.stringify(["a"]));
        formData.append("other", JSON.stringify(["ignored"]));

        expect(parseEventHostCircleIds(formData, "primary")).toEqual(["primary", "a"]);
    });

    test("drops an empty primary circle id", () => {
        expect(parseEventHostCircleIds(formOf(JSON.stringify(["a"])), "")).toEqual(["a"]);
    });
});

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { FormField, FormSchema, UserAndCircleInfo } from "@/models/models";
import { formatZodError, generateZodSchema, getFormValues, getUserOrCircleInfo } from "./form";

const field = (overrides: Partial<FormField> & Pick<FormField, "name">): FormField => ({
    label: overrides.name,
    type: "text",
    ...overrides,
});

const schemaOf = (...fields: FormField[]): FormSchema => ({
    id: "test",
    title: "t",
    description: "d",
    button: { text: "Save" },
    fields,
});

const formDataOf = (entries: [string, string | Blob][]) => {
    const formData = new FormData();
    for (const [key, value] of entries) {
        formData.append(key, value);
    }
    return formData;
};

describe("getUserOrCircleInfo", () => {
    const info: UserAndCircleInfo = { user: "your profile", circle: "this circle" };

    test("returns plain strings unchanged", () => {
        expect(getUserOrCircleInfo("hello")).toBe("hello");
        expect(getUserOrCircleInfo("hello", true)).toBe("hello");
    });

    test("returns the user text for user context", () => {
        expect(getUserOrCircleInfo(info, true)).toBe("your profile");
    });

    test("returns the circle text for circle context", () => {
        expect(getUserOrCircleInfo(info, false)).toBe("this circle");
    });

    test("defaults to the circle text when the context is unspecified", () => {
        expect(getUserOrCircleInfo(info)).toBe("this circle");
    });
});

describe("getFormValues", () => {
    test("returns raw string values for plain and unknown fields", () => {
        const values = getFormValues(
            formDataOf([
                ["name", "Alice"],
                ["unknown", "value"],
            ]),
            schemaOf(field({ name: "name" })),
        );
        expect(values).toEqual({ name: "Alice", unknown: "value" });
    });

    test.each(["array", "table", "access-rules", "location", "skills"] as const)(
        "parses %s fields as JSON",
        (type) => {
            const values = getFormValues(
                formDataOf([["field", JSON.stringify({ nested: [1, 2, 3] })]]),
                schemaOf(field({ name: "field", type })),
            );
            expect(values).toEqual({ field: { nested: [1, 2, 3] } });
        },
    );

    test("omits JSON-typed fields whose value is the string 'undefined'", () => {
        const values = getFormValues(
            formDataOf([["items", "undefined"]]),
            schemaOf(field({ name: "items", type: "array" })),
        );
        expect(values).toEqual({});
    });

    test("throws when a JSON-typed field contains invalid JSON", () => {
        expect(() =>
            getFormValues(formDataOf([["items", "{not json"]]), schemaOf(field({ name: "items", type: "array" }))),
        ).toThrow(SyntaxError);
    });

    test("parses switch fields as booleans", () => {
        const values = getFormValues(
            formDataOf([
                ["on", "true"],
                ["off", "false"],
                ["other", "yes"],
                ["empty", ""],
            ]),
            schemaOf(
                field({ name: "on", type: "switch" }),
                field({ name: "off", type: "switch" }),
                field({ name: "other", type: "switch" }),
                field({ name: "empty", type: "switch" }),
            ),
        );
        expect(values).toEqual({ on: true, off: false, other: false, empty: false });
    });

    test("splits tag fields on commas", () => {
        const values = getFormValues(
            formDataOf([["tags", "a,b,c"]]),
            schemaOf(field({ name: "tags", type: "tags" })),
        );
        expect(values).toEqual({ tags: ["a", "b", "c"] });
    });

    test("does not trim tag values", () => {
        const values = getFormValues(
            formDataOf([["tags", "a, b"]]),
            schemaOf(field({ name: "tags", type: "tags" })),
        );
        expect(values).toEqual({ tags: ["a", " b"] });
    });

    test("turns empty or 'undefined' tag values into an empty array", () => {
        const values = getFormValues(
            formDataOf([
                ["empty", ""],
                ["missing", "undefined"],
            ]),
            schemaOf(field({ name: "empty", type: "tags" }), field({ name: "missing", type: "tags" })),
        );
        expect(values).toEqual({ empty: [], missing: [] });
    });

    test("keeps File values for other field types untouched", () => {
        const file = new File(["x"], "pic.png", { type: "image/png" });
        const values = getFormValues(formDataOf([["image", file]]), schemaOf(field({ name: "image", type: "image" })));
        expect(values.image).toBeInstanceOf(File);
        expect((values.image as File).name).toBe("pic.png");
    });

    test("keeps only the last value for a repeated key", () => {
        const values = getFormValues(
            formDataOf([
                ["name", "first"],
                ["name", "second"],
            ]),
            schemaOf(field({ name: "name" })),
        );
        expect(values).toEqual({ name: "second" });
    });

    test("returns an empty object for empty form data", () => {
        expect(getFormValues(new FormData(), schemaOf())).toEqual({});
    });
});

describe("formatZodError", () => {
    test("formats the first issue as 'path: message'", () => {
        const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(formatZodError(result.error)).toBe("a.b: Expected string, received number");
        }
    });

    test("only reports the first of several issues", () => {
        const result = z.object({ a: z.string(), b: z.string() }).safeParse({});
        if (!result.success) {
            expect(result.error.issues).toHaveLength(2);
            expect(formatZodError(result.error)).toBe("a: Required");
        }
    });

    test("uses an empty path for root-level issues", () => {
        const result = z.string().safeParse(5);
        if (!result.success) {
            expect(formatZodError(result.error)).toBe(": Expected string, received number");
        }
    });

    test("returns an empty string when there are no issues", () => {
        expect(formatZodError(new z.ZodError([]))).toBe("");
    });

    test("includes array indexes in the path", () => {
        const result = z.object({ list: z.array(z.number()) }).safeParse({ list: [1, "x"] });
        if (!result.success) {
            expect(formatZodError(result.error)).toBe("list.1: Expected number, received string");
        }
    });
});

describe("generateZodSchema", () => {
    const parse = (fields: FormField[], value: unknown) => generateZodSchema(fields).safeParse(value);

    test("builds a strict-typed object schema keyed by field name", () => {
        const schema = generateZodSchema([field({ name: "a", required: true }), field({ name: "b", required: true })]);
        expect(schema.safeParse({ a: "1", b: "2" }).success).toBe(true);
        expect(schema.safeParse({ a: "1" }).success).toBe(false);
    });

    test("strips unknown keys", () => {
        const result = parse([field({ name: "a", required: true })], { a: "1", extra: "x" });
        expect(result.success && result.data).toEqual({ a: "1" });
    });

    test("makes fields optional unless required", () => {
        expect(parse([field({ name: "a" })], {}).success).toBe(true);
        expect(parse([field({ name: "a", required: true })], {}).success).toBe(false);
    });

    test("does not allow null for optional fields", () => {
        expect(parse([field({ name: "a" })], { a: null }).success).toBe(false);
    });

    describe("text-like fields", () => {
        test.each(["text", "textarea", "hidden", "auto-handle", "sdgs"] as const)("%s validates strings", (type) => {
            const fields = [field({ name: "a", type, required: true })];
            expect(parse(fields, { a: "ok" }).success).toBe(true);
            expect(parse(fields, { a: 1 }).success).toBe(false);
        });

        test("enforces minLength with the field's validation message", () => {
            const fields = [field({ name: "a", required: true, minLength: 3, validationMessage: "too short" })];
            const result = parse(fields, { a: "ab" });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("too short");
            }
            expect(parse(fields, { a: "abc" }).success).toBe(true);
        });

        test("enforces maxLength", () => {
            const fields = [field({ name: "a", required: true, maxLength: 3 })];
            expect(parse(fields, { a: "abc" }).success).toBe(true);
            expect(parse(fields, { a: "abcd" }).success).toBe(false);
        });

        test("applies length limits before making the field optional", () => {
            const fields = [field({ name: "a", minLength: 3 })];
            expect(parse(fields, {}).success).toBe(true);
            expect(parse(fields, { a: "ab" }).success).toBe(false);
        });

        test("does not enforce a minLength of zero", () => {
            expect(parse([field({ name: "a", required: true, minLength: 0 })], { a: "" }).success).toBe(true);
        });
    });

    test("validates emails", () => {
        const fields = [field({ name: "e", type: "email", required: true })];
        expect(parse(fields, { e: "a@b.co" }).success).toBe(true);
        const bad = parse(fields, { e: "nope" });
        expect(bad.success).toBe(false);
        if (!bad.success) {
            expect(bad.error.issues[0].message).toBe("Enter valid email");
        }
    });

    test("requires passwords of at least 8 characters", () => {
        const fields = [field({ name: "p", type: "password", required: true })];
        expect(parse(fields, { p: "12345678" }).success).toBe(true);
        expect(parse(fields, { p: "1234567" }).success).toBe(false);
    });

    test("combines the password minimum with a field-specific minLength message", () => {
        const fields = [field({ name: "p", type: "password", required: true, minLength: 10, validationMessage: "x" })];
        expect(parse(fields, { p: "123456789" }).success).toBe(false);
        expect(parse(fields, { p: "1234567890" }).success).toBe(true);
    });

    test("validates handles", () => {
        const fields = [field({ name: "h", type: "handle", required: true })];
        expect(parse(fields, { h: "my-handle-1" }).success).toBe(true);
        expect(parse(fields, { h: "no spaces" }).success).toBe(false);
        expect(parse(fields, { h: "a".repeat(21) }).success).toBe(false);
    });

    test("validates numbers without coercing strings", () => {
        const fields = [field({ name: "n", type: "number", required: true })];
        expect(parse(fields, { n: 5 }).success).toBe(true);
        expect(parse(fields, { n: "5" }).success).toBe(false);
    });

    test("validates switches as booleans", () => {
        const fields = [field({ name: "s", type: "switch", required: true })];
        expect(parse(fields, { s: false }).success).toBe(true);
        expect(parse(fields, { s: "true" }).success).toBe(false);
    });

    test.each(["tags", "skills"] as const)("%s validates string arrays", (type) => {
        const fields = [field({ name: "t", type, required: true })];
        expect(parse(fields, { t: ["a", "b"] }).success).toBe(true);
        expect(parse(fields, { t: [1] }).success).toBe(false);
    });

    test("validates locations", () => {
        const fields = [field({ name: "l", type: "location", required: true })];
        expect(parse(fields, { l: { precision: 2, city: "Malmo" } }).success).toBe(true);
        expect(parse(fields, { l: { city: "Malmo" } }).success).toBe(false);
    });

    test("validates access rules", () => {
        const fields = [field({ name: "r", type: "access-rules", required: true })];
        expect(parse(fields, { r: { feed: { view: ["admins"] } } }).success).toBe(true);
        expect(parse(fields, { r: { feed: ["admins"] } }).success).toBe(false);
    });

    describe("select fields", () => {
        const options = [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
        ];

        test("accepts only the listed option values", () => {
            const fields = [field({ name: "s", type: "select", options, required: true })];
            expect(parse(fields, { s: "b" }).success).toBe(true);
            expect(parse(fields, { s: "c" }).success).toBe(false);
        });

        test("supports a single option", () => {
            const fields = [field({ name: "s", type: "select", options: [options[0]], required: true })];
            expect(parse(fields, { s: "a" }).success).toBe(true);
            expect(parse(fields, { s: "b" }).success).toBe(false);
        });

        test("throws when there are no options", () => {
            expect(() => generateZodSchema([field({ name: "s", type: "select", options: [] })])).toThrow(
                "Enum validation for field s requires at least one option.",
            );
            expect(() => generateZodSchema([field({ name: "s", type: "select" })])).toThrow(
                "Enum validation for field s requires at least one option.",
            );
        });
    });

    describe("image fields", () => {
        const fields = [field({ name: "i", type: "image", required: true, imageMaxSize: 1000 })];

        test("accepts supported image types under the limit", () => {
            expect(parse(fields, { i: { size: 500, type: "image/png" } }).success).toBe(true);
        });

        test("rejects files over the size limit", () => {
            const result = parse(fields, { i: { size: 1001, type: "image/png" } });
            expect(result.success).toBe(false);
        });

        test("rejects unsupported file types", () => {
            expect(parse(fields, { i: { size: 10, type: "application/pdf" } }).success).toBe(false);
        });

        test("accepts values without a size or type such as an existing URL", () => {
            expect(parse(fields, { i: "https://example.com/pic.png" }).success).toBe(true);
        });
    });

    describe("array and table fields", () => {
        const itemSchema = schemaOf(field({ name: "name", required: true }), field({ name: "qty", type: "number" }));

        test.each(["array", "table"] as const)("%s validates each item against its item schema", (type) => {
            const fields = [field({ name: "rows", type, itemSchema, required: true })];
            expect(parse(fields, { rows: [{ name: "a" }, { name: "b", qty: 2 }] }).success).toBe(true);
            expect(parse(fields, { rows: [{ qty: 2 }] }).success).toBe(false);
        });

        test("accepts an empty array when there is no item schema", () => {
            const fields = [field({ name: "rows", type: "array", required: true })];
            expect(parse(fields, { rows: [] }).success).toBe(true);
            expect(parse(fields, { rows: [{ anything: 1 }] }).success).toBe(true);
        });

        test("rejects duplicates of the unique field with a descriptive issue", () => {
            const fields = [field({ name: "rows", type: "array", itemSchema, ensureUniqueField: "name", required: true })];
            const result = parse(fields, { rows: [{ name: "a" }, { name: "b" }, { name: "a" }] });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues).toHaveLength(1);
                expect(result.error.issues[0].message).toBe(
                    "Found duplicate value 'a'. Please ensure each name is unique.",
                );
                expect(result.error.issues[0].path).toEqual(["rows", 2, "name"]);
            }
        });

        test("accepts arrays with unique values for the unique field", () => {
            const fields = [field({ name: "rows", type: "array", itemSchema, ensureUniqueField: "name", required: true })];
            expect(parse(fields, { rows: [{ name: "a" }, { name: "b" }] }).success).toBe(true);
        });

        test("reports only the first duplicate", () => {
            const fields = [field({ name: "rows", type: "array", itemSchema, ensureUniqueField: "name", required: true })];
            const result = parse(fields, { rows: [{ name: "a" }, { name: "a" }, { name: "a" }] });
            if (!result.success) {
                expect(result.error.issues).toHaveLength(1);
                expect(result.error.issues[0].path).toEqual(["rows", 1, "name"]);
            }
        });
    });

    test("returns an object schema that accepts anything for an empty field list", () => {
        expect(parse([], {}).success).toBe(true);
        expect(parse([], { any: 1 }).success && (parse([], { any: 1 }) as z.SafeParseSuccess<unknown>).data).toEqual({});
    });
});

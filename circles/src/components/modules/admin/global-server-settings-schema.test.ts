import { describe, expect, test } from "bun:test";
import { generateZodSchema } from "@/lib/utils/form";
import { globalServerSettingsFormSchema, globalServerSettingsValidationSchema } from "./global-server-settings-schema";

const valid = {
    name: "My server",
    url: "https://circles.example",
    jwtSecret: "secret",
    openaiKey: "sk-openai",
    mapboxKey: "pk.mapbox",
};

const issuesFor = (input: Record<string, unknown>) => {
    const result = globalServerSettingsValidationSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
};

describe("globalServerSettingsValidationSchema", () => {
    test("accepts the required fields alone", () => {
        expect(globalServerSettingsValidationSchema.safeParse(valid).success).toBe(true);
    });

    test("accepts every optional field", () => {
        const result = globalServerSettingsValidationSchema.safeParse({
            ...valid,
            description: "About",
            registryUrl: "https://registry.example",
            defaultCircleId: "abc",
            did: "did:server",
        });

        expect(result.success).toBe(true);
    });

    test("reports every missing required field", () => {
        expect(issuesFor({})).toEqual([
            "name: Required",
            "url: Required",
            "jwtSecret: Required",
            "openaiKey: Required",
            "mapboxKey: Required",
        ]);
    });

    test.each([
        ["name", "Server name is required"],
        ["jwtSecret", "JWT Secret is required"],
        ["openaiKey", "OpenAI API Key is required"],
        ["mapboxKey", "Mapbox API Key is required"],
    ])("rejects an empty %s with a specific message", (field, message) => {
        expect(issuesFor({ ...valid, [field]: "" })).toEqual([`${field}: ${message}`]);
    });

    test("rejects a url that is not a url", () => {
        expect(issuesFor({ ...valid, url: "not a url" })).toEqual(["url: Invalid URL format"]);
        expect(issuesFor({ ...valid, url: "circles.example" })).toEqual(["url: Invalid URL format"]);
    });

    test("rejects an empty url", () => {
        expect(issuesFor({ ...valid, url: "" })[0]).toBe("url: Invalid URL format");
    });

    test("allows the registry url to be missing, empty or a valid url", () => {
        expect(issuesFor({ ...valid })).toEqual([]);
        expect(issuesFor({ ...valid, registryUrl: "" })).toEqual([]);
        expect(issuesFor({ ...valid, registryUrl: "https://registry.example" })).toEqual([]);
    });

    test("rejects an invalid registry url", () => {
        expect(issuesFor({ ...valid, registryUrl: "nope" }).length).toBeGreaterThan(0);
    });

    test("rejects wrong types", () => {
        expect(issuesFor({ ...valid, name: 5 })).toEqual(["name: Expected string, received number"]);
    });

    test("strips unknown keys from the parsed data", () => {
        const result = globalServerSettingsValidationSchema.parse({ ...valid, extra: "x" });

        expect(result).not.toHaveProperty("extra");
    });
});

describe("globalServerSettingsFormSchema", () => {
    const fields = globalServerSettingsFormSchema.fields;

    test("describes the global settings form", () => {
        expect(globalServerSettingsFormSchema).toMatchObject({
            id: "global-server-settings-form",
            title: "Global Server Settings",
            button: { text: "Save Global Configuration" },
        });
    });

    test("lists the settings fields in display order", () => {
        expect(fields.map((field) => field.name)).toEqual([
            "defaultCircleId",
            "name",
            "description",
            "url",
            "registryUrl",
            "jwtSecret",
            "openaiKey",
            "mapboxKey",
        ]);
    });

    test("has unique field names", () => {
        expect(new Set(fields.map((field) => field.name)).size).toBe(fields.length);
    });

    test("masks the secrets and keys as password fields", () => {
        for (const name of ["jwtSecret", "openaiKey", "mapboxKey"]) {
            expect(fields.find((field) => field.name === name)?.type).toBe("password");
        }
    });

    test("hides the default circle id", () => {
        expect(fields.find((field) => field.name === "defaultCircleId")).toMatchObject({ type: "hidden", required: false });
    });

    test("marks exactly the fields required by the validation schema as required", () => {
        const required = fields.filter((field) => field.required).map((field) => field.name).sort();

        expect(required).toEqual(["jwtSecret", "mapboxKey", "name", "openaiKey", "url"]);
    });

    test("only names fields that exist in the validation schema", () => {
        const known = Object.keys(globalServerSettingsValidationSchema.shape);

        for (const field of fields) expect(known).toContain(field.name);
    });

    test("can be turned into a form validator that agrees on which fields are required", () => {
        const formValidator = generateZodSchema(fields);

        expect(formValidator.safeParse({ name: "n", url: "https://x.example", jwtSecret: "secret-123", openaiKey: "openai-123", mapboxKey: "mapbox-123" }).success).toBe(true);
        expect(formValidator.safeParse({ name: "n" }).success).toBe(false);
    });

    test("the form validator also enforces the eight character minimum on password fields, which the settings schema does not", () => {
        const formValidator = generateZodSchema(fields);
        const input = { name: "n", url: "https://x.example", jwtSecret: "short", openaiKey: "openai-123", mapboxKey: "mapbox-123" };

        expect(formValidator.safeParse(input).success).toBe(false);
        expect(globalServerSettingsValidationSchema.safeParse(input).success).toBe(true);
    });
});

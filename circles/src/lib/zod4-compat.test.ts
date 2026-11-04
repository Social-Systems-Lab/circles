// @ts-expect-error Bun provides its test APIs at runtime.
import { describe, expect, test } from "bun:test";
import { zodResolver } from "@hookform/resolvers/zod";
import OpenAI from "openai";
import { z } from "zod";
import { globalServerSettingsValidationSchema } from "@/components/modules/admin/global-server-settings-schema";
import { moduleSchema } from "@/models/models";

describe("Zod 4 compatibility", () => {
    test("preserves defaults, optional values, and typed records", () => {
        const schema = z.object({
            enabled: z.boolean().default(false),
            description: z.string().optional(),
            noticesByCircle: z.record(z.string(), z.string()).optional(),
        });

        expect(schema.parse({})).toEqual({ enabled: false });
        expect(schema.parse({ noticesByCircle: { north: "notice-1" } })).toEqual({
            enabled: false,
            noticesByCircle: { north: "notice-1" },
        });
        expect(schema.safeParse({ noticesByCircle: { north: 7 } }).success).toBe(false);
    });

    test("keeps optional dynamic module components compatible with stored module data", () => {
        expect(
            moduleSchema.parse({
                name: "Legacy module",
                handle: "legacy-module",
                description: "A module stored before component metadata was present.",
            }),
        ).toMatchObject({ handle: "legacy-module" });
    });

    test("server-action settings validation retains field paths through Zod 4 issues", () => {
        const result = globalServerSettingsValidationSchema.safeParse({
            name: "Kamooni",
            url: "not-a-url",
            jwtSecret: "test-secret",
            openaiKey: "test-key",
            mapboxKey: "test-mapbox-key",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((issue) => issue.path.join(".") === "url")).toBe(true);
            expect(result.error.issues.some((issue) => issue.message === "Invalid URL format")).toBe(true);
        }
    });

    test("the React Hook Form resolver returns field errors for invalid input", async () => {
        const schema = z.object({ handle: z.string().min(3, "Handle is too short") });
        const resolver = zodResolver(schema);
        const result = await resolver({ handle: "x" }, undefined, {
            criteriaMode: "firstError",
            fields: {},
            shouldUseNativeValidation: false,
        });

        expect(JSON.stringify(result)).toContain("Handle is too short");
    });

    test("the React Hook Form resolver preserves optional and transformed form values", async () => {
        const schema = z.object({
            note: z
                .string()
                .optional()
                .transform((value) => value?.trim() || undefined)
                .pipe(z.string().max(20).optional()),
            slots: z
                .union([z.string(), z.number(), z.null(), z.undefined()])
                .transform((value) => {
                    if (value === "" || value == null) return undefined;
                    return typeof value === "string" ? Number(value) : value;
                })
                .pipe(z.number().int().positive().optional()),
        });
        const resolver = zodResolver(schema);
        const result = await resolver({ note: "  bring water  ", slots: "3" }, undefined, {
            criteriaMode: "firstError",
            fields: {},
            shouldUseNativeValidation: false,
        });

        expect(result.values).toEqual({ note: "bring water", slots: 3 });
        expect(result.errors).toEqual({});
    });

    test("OpenAI embeddings requests work with the single resolved Zod 4 dependency", async () => {
        let requestBody: { model?: string; input?: string; encoding_format?: string } | undefined;
        const client = new OpenAI({
            apiKey: "zod-migration-test-key",
            baseURL: "https://openai.test/v1",
            fetch: async (input, init) => {
                requestBody = await new Request(input, init).json();
                return Response.json({
                    object: "list",
                    model: "text-embedding-3-small",
                    data: [{ object: "embedding", index: 0, embedding: "AACAPgAAAL8=" }],
                    usage: { prompt_tokens: 2, total_tokens: 2 },
                });
            },
        });

        const result = await client.embeddings.create({ model: "text-embedding-3-small", input: "hello" });

        expect(result.data[0]?.embedding).toEqual([0.25, -0.5]);
        expect(requestBody).toEqual({
            model: "text-embedding-3-small",
            input: "hello",
            encoding_format: "base64",
        });
    });
});

// @ts-expect-error Bun provides its test and mock APIs at runtime; this repository does not install their types.
import { describe, expect, mock, test } from "bun:test";

type Stored = Record<string, any>;
const stored: Stored[] = [];
const indexCalls: unknown[][] = [];

mock.module("@/lib/data/db", () => ({
    CapturedEmails: {
        createIndex: async (...args: unknown[]) => {
            indexCalls.push(args);
            return "expiresAt_1";
        },
        insertOne: async (doc: Stored) => {
            stored.push(doc);
            return { insertedId: String(stored.length) };
        },
        find: (filter: { createdAt: { $gt: Date } }) => {
            let result = stored.filter((doc) => doc.createdAt > filter.createdAt.$gt);
            const cursor = {
                sort: () => {
                    result = [...result].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                    return cursor;
                },
                limit: (amount: number) => {
                    result = result.slice(0, amount);
                    return cursor;
                },
                toArray: async () => result,
            };
            return cursor;
        },
    },
}));

const { CAPTURED_EMAIL_TTL_MS, listCapturedEmails, storeCapturedEmail } = await import("./captured-emails");

describe("captured email retention", () => {
    test("stores a 24-hour expiry and creates one TTL index", async () => {
        const now = new Date("2026-10-21T10:00:00Z");
        await storeCapturedEmail({ to: "a@example.test", templateAlias: "a", templateModel: {} }, now);
        await storeCapturedEmail({ to: "b@example.test", templateAlias: "b", templateModel: {} }, now);
        expect(stored[0].expiresAt.getTime() - stored[0].createdAt.getTime()).toBe(CAPTURED_EMAIL_TTL_MS);
        expect(indexCalls).toEqual([[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
    });

    test("lists only the newest 50 documents from the retention window", async () => {
        stored.length = 0;
        const now = new Date("2026-10-21T10:00:00Z");
        for (let index = 0; index < 55; index += 1) {
            stored.push({ createdAt: new Date(now.getTime() - index * 1000), templateAlias: `t${index}` });
        }
        stored.push({ createdAt: new Date(now.getTime() - CAPTURED_EMAIL_TTL_MS - 1), templateAlias: "expired" });
        const result = await listCapturedEmails(now);
        expect(result).toHaveLength(50);
        expect(result[0].templateAlias).toBe("t0");
        expect(result.some((email) => email.templateAlias === "expired")).toBe(false);
    });
});

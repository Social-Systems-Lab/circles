import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { ObjectId } from "mongodb";
import { WELCOME_MESSAGE } from "@/config/welcome-message";
import { useFakeNow } from "@/test/hooks";
import { mockDb, namedCollection } from "@/test/mock-db";

const db = mockDb();

const getCircleByHandle = mock(async (_handle: string): Promise<Record<string, unknown> | null> => ({ _id: "kamooni-circle", handle: "kamooni" }));
mock.module("@/lib/data/circle", () => ({ getCircleByHandle }));

const templates = await import("./system-message-templates");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const collection = () => namedCollection(db, "systemMessageTemplates");

const seedTemplate = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    collection().docs.push({
        _id,
        key: "welcome",
        title: "Custom title",
        bodyMarkdown: "Custom body",
        senderCircleHandle: "kamooni",
        repliesDisabled: false,
        isActive: true,
        version: "v3",
        updatedAt: NOW,
        updatedBy: "did:admin",
        ...overrides,
    });
    return _id;
};

beforeEach(() => {
    collection().docs = [];
    getCircleByHandle.mockReset();
    getCircleByHandle.mockResolvedValue({ _id: "kamooni-circle", handle: "kamooni" });
});

describe("WELCOME_SYSTEM_TEMPLATE_KEY", () => {
    test("is the welcome key", () => {
        expect(templates.WELCOME_SYSTEM_TEMPLATE_KEY).toBe("welcome");
    });
});

describe("getResolvedWelcomeTemplate", () => {
    test("falls back to the built-in welcome message when no template is stored", async () => {
        const resolved = await templates.getResolvedWelcomeTemplate();

        expect(resolved.templateSource).toBe("fallback");
        expect(resolved.template).toBeNull();
        expect(resolved.config).toEqual(WELCOME_MESSAGE);
    });

    test("sends from the Kamooni system sender", async () => {
        const resolved = await templates.getResolvedWelcomeTemplate();

        expect(resolved.senderDid).toBe("system:kamooni");
        expect(resolved.config).toMatchObject({ senderHandle: "kamooni", displayName: "Kamooni", avatarUrl: "/images/kamooni_logo.png" });
        expect(getCircleByHandle).toHaveBeenCalledWith("kamooni");
    });

    test("returns the sender's circle when it exists and null when it does not", async () => {
        expect((await templates.getResolvedWelcomeTemplate()).senderCircle).toEqual({ _id: "kamooni-circle", handle: "kamooni" });

        getCircleByHandle.mockResolvedValue(null);
        expect((await templates.getResolvedWelcomeTemplate()).senderCircle).toBeNull();
    });

    test("uses the stored active template's title, body, version and reply setting", async () => {
        const id = seedTemplate();

        const resolved = await templates.getResolvedWelcomeTemplate();

        expect(resolved.templateSource).toBe("db");
        expect(resolved.template?._id).toBe(id.toString());
        expect(resolved.config).toEqual({
            senderHandle: "kamooni",
            displayName: "Kamooni",
            avatarUrl: "/images/kamooni_logo.png",
            threadName: "Custom title",
            source: "system_welcome",
            version: "v3",
            repliesDisabled: false,
            markdown: "Custom body",
        });
    });

    test("ignores an inactive template", async () => {
        seedTemplate({ isActive: false });

        const resolved = await templates.getResolvedWelcomeTemplate();

        expect(resolved.templateSource).toBe("fallback");
        expect(resolved.config.markdown).toBe(WELCOME_MESSAGE.markdown);
    });

    test("ignores templates stored under other keys", async () => {
        seedTemplate({ key: "announcement" });

        expect((await templates.getResolvedWelcomeTemplate()).templateSource).toBe("fallback");
    });

    test.each([
        ["title", { title: "" }, "threadName", WELCOME_MESSAGE.threadName],
        ["body", { bodyMarkdown: "" }, "markdown", WELCOME_MESSAGE.markdown],
        ["version", { version: "" }, "version", WELCOME_MESSAGE.version],
    ])("falls back to the built-in %s when the stored one is empty", async (_label, overrides, field, expected) => {
        seedTemplate(overrides);

        expect((await templates.getResolvedWelcomeTemplate()).config[field as "threadName"]).toBe(expected);
    });

    test("respects a stored reply setting of false rather than falling back", async () => {
        seedTemplate({ repliesDisabled: false });

        expect((await templates.getResolvedWelcomeTemplate()).config.repliesDisabled).toBe(false);
        expect(WELCOME_MESSAGE.repliesDisabled).toBe(true);
    });

    test("always keeps the system_welcome source", async () => {
        seedTemplate();

        expect((await templates.getResolvedWelcomeTemplate()).config.source).toBe("system_welcome");
    });
});

describe("getWelcomeTemplateDraft", () => {
    test("describes the built-in message when nothing is stored", async () => {
        expect(await templates.getWelcomeTemplateDraft()).toEqual({
            template: null,
            templateSource: "fallback",
            title: WELCOME_MESSAGE.threadName,
            bodyMarkdown: WELCOME_MESSAGE.markdown,
            repliesDisabled: WELCOME_MESSAGE.repliesDisabled,
            senderCircleHandle: "kamooni",
            isActive: true,
            version: WELCOME_MESSAGE.version,
            updatedAt: undefined,
            senderCircle: { _id: "kamooni-circle", handle: "kamooni" },
            senderDid: "system:kamooni",
        });
    });

    test("reflects the stored template", async () => {
        const id = seedTemplate({ repliesDisabled: false, isActive: false });

        const draft = await templates.getWelcomeTemplateDraft();

        expect(draft).toMatchObject({
            templateSource: "db",
            title: "Custom title",
            bodyMarkdown: "Custom body",
            repliesDisabled: false,
            isActive: false,
            version: "v3",
            updatedAt: NOW,
        });
        expect(draft.template?._id).toBe(id.toString());
    });

    test("includes an inactive template, unlike resolving for sending", async () => {
        seedTemplate({ isActive: false });

        expect((await templates.getWelcomeTemplateDraft()).templateSource).toBe("db");
        expect((await templates.getResolvedWelcomeTemplate()).templateSource).toBe("fallback");
    });

    test("treats a stored template without isActive as active", async () => {
        seedTemplate();
        delete collection().docs[0].isActive;

        expect((await templates.getWelcomeTemplateDraft()).isActive).toBe(true);
    });
});

describe("saveWelcomeTemplate", () => {
    const input = { title: "Hello", bodyMarkdown: "Body", repliesDisabled: true, updatedBy: "did:admin" };

    test("creates the template with the built-in version the first time", async () => {
        const saved = await templates.saveWelcomeTemplate(input);

        expect(saved).toMatchObject({
            key: "welcome",
            title: "Hello",
            bodyMarkdown: "Body",
            senderCircleHandle: "kamooni",
            repliesDisabled: true,
            isActive: true,
            version: WELCOME_MESSAGE.version,
            updatedAt: NOW,
            updatedBy: "did:admin",
        });
        expect(saved._id).toBeString();
        expect(collection().docs).toHaveLength(1);
    });

    test("replaces the existing template and bumps its version each time", async () => {
        seedTemplate({ version: "v3" });

        const saved = await templates.saveWelcomeTemplate(input);

        expect(collection().docs).toHaveLength(1);
        expect(saved).toMatchObject({ title: "Hello", version: "v4" });
        expect((await templates.saveWelcomeTemplate(input)).version).toBe("v5");
    });

    test.each([
        ["v9", "v10"],
        ["V1", "v2"],
        [" v3 ", "v4"],
        ["v0", "v1"],
        ["v99", "v100"],
    ])("bumps the version %p to %p", async (current, expected) => {
        seedTemplate({ version: current });

        expect((await templates.saveWelcomeTemplate(input)).version).toBe(expected);
    });

    test.each(["1.0", "beta", "v", "v1.2", "v-1"])("leaves a version that is not vN (%p) unchanged", async (current) => {
        seedTemplate({ version: current });

        expect((await templates.saveWelcomeTemplate(input)).version).toBe(current);
    });

    test("bumps from the built-in version when the stored template has none", async () => {
        seedTemplate({ version: undefined });
        delete collection().docs[0].version;

        expect((await templates.saveWelcomeTemplate(input)).version).toBe("v3");
    });

    describe("activation", () => {
        test("defaults to active for a new template", async () => {
            expect((await templates.saveWelcomeTemplate(input)).isActive).toBe(true);
        });

        test("keeps the current activation when not specified", async () => {
            seedTemplate({ isActive: false });

            expect((await templates.saveWelcomeTemplate(input)).isActive).toBe(false);
        });

        test("applies an explicit activation", async () => {
            seedTemplate({ isActive: true });

            expect((await templates.saveWelcomeTemplate({ ...input, isActive: false })).isActive).toBe(false);
            expect((await templates.saveWelcomeTemplate({ ...input, isActive: true })).isActive).toBe(true);
        });
    });

    describe("updatedBy", () => {
        test("records who saved it", async () => {
            expect((await templates.saveWelcomeTemplate({ ...input, updatedBy: "did:new" })).updatedBy).toBe("did:new");
        });

        test("keeps the previous editor when none is given", async () => {
            seedTemplate({ updatedBy: "did:previous" });

            expect((await templates.saveWelcomeTemplate({ title: "T", bodyMarkdown: "B", repliesDisabled: false })).updatedBy).toBe("did:previous");
        });

        test("is left empty for a new template saved without an editor", async () => {
            expect((await templates.saveWelcomeTemplate({ title: "T", bodyMarkdown: "B", repliesDisabled: false })).updatedBy).toBeUndefined();
        });
    });

    test("stamps the time of the save", async () => {
        await templates.saveWelcomeTemplate(input);
        const later = new Date(NOW.getTime() + 60_000);
        setSystemTime(later);

        expect((await templates.saveWelcomeTemplate(input)).updatedAt).toEqual(later);
    });

    test("does not touch templates stored under other keys", async () => {
        seedTemplate({ key: "announcement", title: "Other" });

        await templates.saveWelcomeTemplate(input);

        expect(collection().docs).toHaveLength(2);
        expect(collection().docs.find((doc) => doc.key === "announcement")!.title).toBe("Other");
    });

    test("makes the saved template the one used for sending", async () => {
        await templates.saveWelcomeTemplate(input);

        const resolved = await templates.getResolvedWelcomeTemplate();

        expect(resolved.templateSource).toBe("db");
        expect(resolved.config).toMatchObject({ threadName: "Hello", markdown: "Body", repliesDisabled: true });
    });
});

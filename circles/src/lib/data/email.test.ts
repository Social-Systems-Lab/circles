import { afterAll, afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import crypto from "node:crypto";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";

const restoreEnv = snapshotEnv("POSTMARK_API_TOKEN", "POSTMARK_SENDER_EMAIL", "CIRCLES_URL");

const sendEmailWithTemplate = mock(async (_message: unknown): Promise<unknown> => ({ MessageID: "msg-1" }));
const clientTokens: string[] = [];
mock.module("postmark", () => ({
    ServerClient: class FakeServerClient {
        constructor(token: string) {
            clientTokens.push(token);
        }
        sendEmailWithTemplate = sendEmailWithTemplate;
    },
    TemplatedMessage: class FakeTemplatedMessage {
        constructor(
            public From: string,
            public TemplateAlias: string,
            public TemplateModel: Record<string, unknown>,
            public To: string,
        ) {}
    },
}));

// The API token and sender are read when the module loads, so each configuration gets its own instance.
let instance = 0;
const loadEmail = async (env: { POSTMARK_API_TOKEN?: string; POSTMARK_SENDER_EMAIL?: string } = {}) => {
    setEnv("POSTMARK_API_TOKEN", env.POSTMARK_API_TOKEN);
    setEnv("POSTMARK_SENDER_EMAIL", env.POSTMARK_SENDER_EMAIL);
    instance += 1;
    return (await import(`./email?instance=${instance}`)) as typeof import("./email");
};
const configured = () => loadEmail({ POSTMARK_API_TOKEN: "pm-token", POSTMARK_SENDER_EMAIL: "hello@kamooni.example" });

const consoleSpy = silenceConsole("log", "error", "warn");

beforeEach(() => {
    sendEmailWithTemplate.mockReset();
    sendEmailWithTemplate.mockResolvedValue({ MessageID: "msg-1" });
    clientTokens.length = 0;
    setEnv("CIRCLES_URL", undefined);
});

afterEach(() => {
    setSystemTime();
});
afterAll(restoreEnv);

describe("generateSecureToken", () => {
    test("returns 32 random bytes as 64 hex characters by default", async () => {
        const { generateSecureToken } = await configured();

        expect(generateSecureToken()).toMatch(/^[0-9a-f]{64}$/);
    });

    test("honors a custom byte length", async () => {
        const { generateSecureToken } = await configured();

        expect(generateSecureToken(8)).toMatch(/^[0-9a-f]{16}$/);
        expect(generateSecureToken(0)).toBe("");
    });

    test("never repeats", async () => {
        const { generateSecureToken } = await configured();

        expect(new Set(Array.from({ length: 50 }, () => generateSecureToken())).size).toBe(50);
    });
});

describe("hashToken", () => {
    test("is the hex sha256 of the token", async () => {
        const { hashToken } = await configured();

        expect(hashToken("abc")).toBe(crypto.createHash("sha256").update("abc").digest("hex"));
        expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    });

    test("is deterministic and differs between tokens", async () => {
        const { hashToken } = await configured();

        expect(hashToken("a")).toBe(hashToken("a"));
        expect(hashToken("a")).not.toBe(hashToken("b"));
    });

    test("never returns the token itself", async () => {
        const { generateSecureToken, hashToken } = await configured();
        const token = generateSecureToken();

        expect(hashToken(token)).not.toBe(token);
    });
});

describe("applyEmailTemplateDefaults", () => {
    test("adds the Kamooni branding and company details", async () => {
        const { applyEmailTemplateDefaults } = await configured();

        const model = applyEmailTemplateDefaults({});

        expect(model).toMatchObject({
            product_name: "Kamooni",
            company_name: "Social Systems Lab",
            company_url: "https://www.socialsystems.io/",
            company_address: "",
            support_email: "hello@socialsystems.io",
        });
        expect(model.email_signoff_html).toContain('<a href="https://www.socialsystems.io/">Social Systems Lab</a>');
        expect(model.email_signoff_text).toBe(
            "Thanks for being part of Kamooni!\n\nThe Kamooni Team at Social Systems Lab\nhttps://www.socialsystems.io/",
        );
    });

    test("stamps the current year as a string", async () => {
        const { applyEmailTemplateDefaults } = await configured();
        setSystemTime(new Date("2031-03-04T12:00:00.000Z"));

        expect(applyEmailTemplateDefaults({}).current_year).toBe("2031");
    });

    test("keeps the caller's own fields", async () => {
        const { applyEmailTemplateDefaults } = await configured();

        expect(applyEmailTemplateDefaults({ custom: "value", nested: { a: 1 } })).toMatchObject({ custom: "value", nested: { a: 1 } });
    });

    test("does not mutate its input", async () => {
        const { applyEmailTemplateDefaults } = await configured();
        const input = { name: "Vee" };

        applyEmailTemplateDefaults(input);

        expect(input).toEqual({ name: "Vee" });
    });

    describe("name", () => {
        test("keeps a given name and defaults to User", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({ name: "Vee" }).name).toBe("Vee");
            expect(applyEmailTemplateDefaults({}).name).toBe("User");
            expect(applyEmailTemplateDefaults({ name: "" }).name).toBe("User");
        });
    });

    describe("product url", () => {
        test("prefers the template's own value, in either spelling", async () => {
            const { applyEmailTemplateDefaults } = await configured();
            setEnv("CIRCLES_URL", "https://env.example");

            expect(applyEmailTemplateDefaults({ productUrl: "https://a.example" }).product_url).toBe("https://a.example");
            expect(applyEmailTemplateDefaults({ product_url: "https://b.example" }).product_url).toBe("https://b.example");
            expect(applyEmailTemplateDefaults({ productUrl: "https://a.example", product_url: "https://b.example" }).product_url).toBe("https://a.example");
        });

        test("falls back to CIRCLES_URL, then localhost", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({}).product_url).toBe("http://localhost:3000");
            setEnv("CIRCLES_URL", "https://env.example");
            expect(applyEmailTemplateDefaults({}).product_url).toBe("https://env.example");
        });

        test("ignores blank template values", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({ productUrl: "   ", product_url: "" }).product_url).toBe("http://localhost:3000");
        });
    });

    describe("action link", () => {
        test("normalizes the action url to snake case from either spelling", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({ actionUrl: "/a" }).action_url).toBe("/a");
            expect(applyEmailTemplateDefaults({ action_url: "/b" }).action_url).toBe("/b");
            expect(applyEmailTemplateDefaults({ actionUrl: "/a", action_url: "/b" }).action_url).toBe("/a");
        });

        test("leaves the action url undefined when none is given, even clearing a blank one", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({}).action_url).toBeUndefined();
            expect(applyEmailTemplateDefaults({ action_url: "  " }).action_url).toBeUndefined();
        });

        test.each(["actionText", "action_text", "buttonText", "button_text"])("reads the button label from %s", async (key) => {
            const { applyEmailTemplateDefaults } = await configured();

            const model = applyEmailTemplateDefaults({ [key]: "Open it" });

            expect(model.action_text).toBe("Open it");
            expect(model.button_text).toBe("Open it");
        });

        test("prefers actionText over the other spellings", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({ button_text: "b", actionText: "a" }).action_text).toBe("a");
        });

        test("does not add button fields when there is no label", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            const model = applyEmailTemplateDefaults({});

            expect(model).not.toHaveProperty("action_text");
            expect(model).not.toHaveProperty("button_text");
        });
    });

    describe("copy fields", () => {
        test.each([
            ["introText", "intro_text"],
            ["bodyText", "body_text"],
            ["summaryText", "summary_text"],
        ])("normalizes %s to %s", async (camel, snake) => {
            const { applyEmailTemplateDefaults } = await configured();

            expect(applyEmailTemplateDefaults({ [camel]: "text" })[snake]).toBe("text");
            expect(applyEmailTemplateDefaults({ [snake]: "text" })[snake]).toBe("text");
        });

        test("does not add copy fields that were not given", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            const model = applyEmailTemplateDefaults({});

            for (const key of ["intro_text", "body_text", "summary_text"]) expect(model).not.toHaveProperty(key);
        });

        test("ignores non-string and blank values", async () => {
            const { applyEmailTemplateDefaults } = await configured();

            const model = applyEmailTemplateDefaults({ introText: 5, bodyText: "  ", summaryText: null });

            for (const key of ["intro_text", "body_text", "summary_text"]) expect(model).not.toHaveProperty(key);
        });
    });
});

describe("configuration warnings", () => {
    test("warns when the API token is missing", async () => {
        await loadEmail({ POSTMARK_SENDER_EMAIL: "hello@kamooni.example" });

        expect(consoleSpy.warn).toHaveBeenCalledWith("POSTMARK_API_TOKEN is not set. Email functionality will be disabled.");
    });

    test("warns when the sender is missing", async () => {
        await loadEmail({ POSTMARK_API_TOKEN: "pm-token" });

        expect(consoleSpy.warn).toHaveBeenCalledWith("POSTMARK_SENDER_EMAIL is not set. Email functionality will be disabled.");
    });

    test("does not warn when both are set", async () => {
        await configured();

        expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    test("creates the Postmark client only when a token is present", async () => {
        await loadEmail({});
        expect(clientTokens).toEqual([]);

        await configured();
        expect(clientTokens).toEqual(["pm-token"]);
    });
});

describe("sendEmail", () => {
    const options = { to: "vee@example.com", templateAlias: "email-verification", templateModel: { name: "Vee", actionUrl: "/verify" } };

    test("sends the templated message from the configured sender with the defaults applied", async () => {
        const { sendEmail } = await configured();

        await sendEmail(options);

        expect(sendEmailWithTemplate).toHaveBeenCalledTimes(1);
        const message = sendEmailWithTemplate.mock.calls[0][0] as { From: string; To: string; TemplateAlias: string; TemplateModel: Record<string, unknown> };
        expect(message.From).toBe("hello@kamooni.example");
        expect(message.To).toBe("vee@example.com");
        expect(message.TemplateAlias).toBe("email-verification");
        expect(message.TemplateModel).toMatchObject({ name: "Vee", action_url: "/verify", product_name: "Kamooni" });
    });

    test("logs the attempt and the result", async () => {
        const { sendEmail } = await configured();

        await sendEmail(options);

        expect(consoleSpy.log).toHaveBeenCalledWith("Attempting to send email to vee@example.com using template email-verification");
        expect(consoleSpy.log).toHaveBeenCalledWith("Email sent successfully to vee@example.com:", { MessageID: "msg-1" });
    });

    test("silently skips sending, with an error log, when no API token is configured", async () => {
        const { sendEmail } = await loadEmail({ POSTMARK_SENDER_EMAIL: "hello@kamooni.example" });

        await expect(sendEmail(options)).resolves.toBeUndefined();

        expect(sendEmailWithTemplate).not.toHaveBeenCalled();
        expect(consoleSpy.error).toHaveBeenCalledWith("Postmark client is not initialized. POSTMARK_API_TOKEN might be missing.");
    });

    test("silently skips sending, with an error log, when no sender is configured", async () => {
        const { sendEmail } = await loadEmail({ POSTMARK_API_TOKEN: "pm-token" });

        await expect(sendEmail(options)).resolves.toBeUndefined();

        expect(sendEmailWithTemplate).not.toHaveBeenCalled();
        expect(consoleSpy.error).toHaveBeenCalledWith("POSTMARK_SENDER_EMAIL is not configured. Cannot send email.");
    });

    test("wraps Postmark failures with the original message and logs them", async () => {
        const { sendEmail } = await configured();
        sendEmailWithTemplate.mockRejectedValue(new Error("Inactive recipient"));

        await expect(sendEmail(options)).rejects.toThrow("Failed to send email: Inactive recipient");

        expect(consoleSpy.error).toHaveBeenCalledWith(
            "Failed to send email to vee@example.com using template email-verification:",
            expect.any(Error),
        );
    });

    test("wraps failures that are not Error objects", async () => {
        const { sendEmail } = await configured();
        sendEmailWithTemplate.mockRejectedValue("boom");

        await expect(sendEmail(options)).rejects.toThrow("Failed to send email: boom");
    });
});

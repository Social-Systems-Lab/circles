import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ObjectId } from "mongodb";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useFakeNow, useSpyCleanup } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const ENV_NAMES = ["NEXT_PUBLIC_APP_URL", "APP_URL", "SITE_URL", "CIRCLES_URL", "NODE_ENV", "CIRCLES_DEV_LOG_PASSWORD_RESET"];
const restoreEnv = snapshotEnv(...ENV_NAMES);

const db = mockDb();

const sendEmail = mock(async (_message: unknown) => {});
mock.module("@/lib/data/email", () => ({
    sendEmail,
    generateSecureToken: () => "plain-reset-token",
    hashToken: (token: string) => `hashed:${token}`,
}));

let requestHeaders: Record<string, string> | "no-request-scope" = {};
mock.module("next/headers", () => ({
    headers: async () => {
        if (requestHeaders === "no-request-scope") throw new Error("headers() was called outside a request scope");
        return { get: (name: string) => (requestHeaders as Record<string, string>)[name] ?? null };
    },
}));

const { requestPasswordResetAction } = await import("./actions");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const consoleSpy = silenceConsole("log", "error");
const trackSpy = useSpyCleanup();

const GENERIC_SUCCESS = {
    success: true,
    message: "If an account with that email exists and is verified, a password reset link has been sent.",
};

const seedUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, did: "did:vee", name: "Vee", email: "vee@example.com", circleType: "user", isEmailVerified: true, ...overrides });
    return _id;
};
const sentLink = () => (sendEmail.mock.calls.at(-1)![0] as { templateModel: { actionUrl: string } }).templateModel.actionUrl;

beforeEach(() => {
    for (const name of ENV_NAMES) setEnv(name, undefined);
    setEnv("NODE_ENV", "test");
    requestHeaders = {};
    db.Circles.docs = [];
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(undefined);
});
afterAll(restoreEnv);

describe("input", () => {
    test.each([["not-an-email"], [""], ["a@"], ["@example.com"], [undefined as unknown as string], [null as unknown as string]])(
        "rejects the invalid address %p without touching anything",
        async (email) => {
            seedUser();

            expect(await requestPasswordResetAction(email)).toEqual({ success: false, message: "Invalid email address provided." });

            expect(sendEmail).not.toHaveBeenCalled();
            expect(db.Circles.docs[0].passwordResetToken).toBeUndefined();
        },
    );
});

describe("a verified account", () => {
    test("stores only a hash of the reset token, valid for one hour", async () => {
        const id = seedUser();

        await requestPasswordResetAction("vee@example.com");

        expect(db.Circles.byId(id)).toMatchObject({
            passwordResetToken: "hashed:plain-reset-token",
            passwordResetTokenExpiry: new Date(NOW.getTime() + 3600 * 1000),
        });
        expect(JSON.stringify(db.Circles.byId(id))).not.toContain('"plain-reset-token"');
    });

    test("emails the reset link containing the plain token", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");

        await requestPasswordResetAction("vee@example.com");

        expect(sendEmail).toHaveBeenCalledWith({
            to: "vee@example.com",
            templateAlias: "password-reset",
            templateModel: {
                name: "Vee",
                actionUrl: "https://kamooni.example/reset-password?token=plain-reset-token",
                product_name: "Kamooni",
                product_url: "https://kamooni.example",
                support_url: "https://kamooni.example/support",
            },
        });
    });

    test("greets an account without a name as User", async () => {
        seedUser({ name: undefined });
        setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");

        await requestPasswordResetAction("vee@example.com");

        expect((sendEmail.mock.calls[0][0] as { templateModel: { name: string } }).templateModel.name).toBe("User");
    });

    test("returns the generic success message", async () => {
        seedUser();

        expect(await requestPasswordResetAction("vee@example.com")).toEqual(GENERIC_SUCCESS);
    });

    test("only updates the account with that email", async () => {
        seedUser();
        const other = seedUser({ email: "other@example.com", did: "did:other" });

        await requestPasswordResetAction("vee@example.com");

        expect(db.Circles.byId(other)?.passwordResetToken).toBeUndefined();
    });

    test("issues a new token that replaces an earlier one", async () => {
        const id = seedUser({ passwordResetToken: "hashed:older", passwordResetTokenExpiry: new Date(0) });

        await requestPasswordResetAction("vee@example.com");

        expect(db.Circles.byId(id)?.passwordResetToken).toBe("hashed:plain-reset-token");
    });

    test("still reports success, without revealing the failure, when the email cannot be sent", async () => {
        seedUser();
        sendEmail.mockRejectedValue(new Error("smtp down"));

        expect(await requestPasswordResetAction("vee@example.com")).toEqual(GENERIC_SUCCESS);
        expect(consoleSpy.error).toHaveBeenCalledWith("Failed to send password reset email to vee@example.com:", expect.any(Error));
    });
});

describe("accounts that must not be revealed", () => {
    test("an unverified account gets the same response and no token or email", async () => {
        const id = seedUser({ isEmailVerified: false });

        expect(await requestPasswordResetAction("vee@example.com")).toEqual(GENERIC_SUCCESS);

        expect(sendEmail).not.toHaveBeenCalled();
        expect(db.Circles.byId(id)?.passwordResetToken).toBeUndefined();
        expect(consoleSpy.log).toHaveBeenCalledWith("Password reset requested for unverified email: vee@example.com");
    });

    test("an unknown address gets the same response and no email", async () => {
        expect(await requestPasswordResetAction("nobody@example.com")).toEqual(GENERIC_SUCCESS);

        expect(sendEmail).not.toHaveBeenCalled();
        expect(consoleSpy.log).toHaveBeenCalledWith("Password reset requested for non-existent email: nobody@example.com");
    });

    test("verified, unverified and unknown addresses are indistinguishable to the caller", async () => {
        seedUser();
        seedUser({ email: "unverified@example.com", isEmailVerified: false, did: "did:u" });

        const responses = await Promise.all(
            ["vee@example.com", "unverified@example.com", "nobody@example.com"].map((email) => requestPasswordResetAction(email)),
        );

        expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);
    });

    test("returns a generic failure, and logs, when the database fails", async () => {
        trackSpy(spyOn(db.Circles, "findOne").mockRejectedValue(new Error("db down")));

        expect(await requestPasswordResetAction("vee@example.com")).toEqual({
            success: false,
            message: "An error occurred while processing your request. Please try again later.",
        });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error during password reset request:", expect.any(Error));
    });
});

describe("reset link base url", () => {
    const linkBase = async () => {
        seedUser();
        await requestPasswordResetAction("vee@example.com");
        return sentLink().replace("/reset-password?token=plain-reset-token", "");
    };

    describe("configured address", () => {
        test.each([
            ["NEXT_PUBLIC_APP_URL", "https://public.example"],
            ["APP_URL", "https://app.example"],
            ["SITE_URL", "https://site.example"],
        ])("uses %s", async (name, value) => {
            setEnv(name, value);

            expect(await linkBase()).toBe(value);
        });

        test("prefers NEXT_PUBLIC_APP_URL, then APP_URL, then SITE_URL", async () => {
            setEnv("SITE_URL", "https://site.example");
            setEnv("APP_URL", "https://app.example");
            expect(await linkBase()).toBe("https://app.example");

            db.Circles.docs = [];
            setEnv("NEXT_PUBLIC_APP_URL", "https://public.example");
            expect(await linkBase()).toBe("https://public.example");
        });

        test("uses CIRCLES_URL as the explicit address only in production", async () => {
            setEnv("CIRCLES_URL", "https://circles.example");
            requestHeaders = { origin: "https://request.example" };

            expect(await linkBase()).toBe("https://request.example");

            db.Circles.docs = [];
            setEnv("NODE_ENV", "production");
            expect(await linkBase()).toBe("https://circles.example");
        });

        test("beats the address the request came from", async () => {
            setEnv("NEXT_PUBLIC_APP_URL", "https://public.example");
            requestHeaders = { origin: "https://evil.example" };

            expect(await linkBase()).toBe("https://public.example");
        });

        test("drops trailing slashes", async () => {
            setEnv("NEXT_PUBLIC_APP_URL", "https://public.example///");

            expect(await linkBase()).toBe("https://public.example");
        });
    });

    describe("request origin", () => {
        test("uses the Origin header, keeping only its origin", async () => {
            requestHeaders = { origin: "https://request.example/some/path?x=1" };

            expect(await linkBase()).toBe("https://request.example");
        });

        test("falls back to the forwarded host and protocol", async () => {
            requestHeaders = { "x-forwarded-host": "proxy.example", "x-forwarded-proto": "https", host: "internal:3000" };

            expect(await linkBase()).toBe("https://proxy.example");
        });

        test("falls back to the Host header, using http outside production", async () => {
            requestHeaders = { host: "localhost:3000" };

            expect(await linkBase()).toBe("http://localhost:3000");
        });

        test("assumes https in production when no protocol is forwarded", async () => {
            setEnv("NODE_ENV", "production");
            requestHeaders = { host: "kamooni.example" };

            expect(await linkBase()).toBe("https://kamooni.example");
        });

        test("ignores an Origin header that is not a url and uses the fallback", async () => {
            requestHeaders = { origin: "not a url" };

            expect(await linkBase()).toBe("http://localhost:3000");
        });
    });

    describe("fallbacks", () => {
        test("uses CIRCLES_URL, then localhost, when there is no request scope", async () => {
            requestHeaders = "no-request-scope";
            expect(await linkBase()).toBe("http://localhost:3000");

            db.Circles.docs = [];
            setEnv("CIRCLES_URL", "https://circles.example");
            expect(await linkBase()).toBe("https://circles.example");
        });

        test("uses localhost when nothing at all is known", async () => {
            expect(await linkBase()).toBe("http://localhost:3000");
        });
    });

    describe("internal docker host", () => {
        test("is never put in a link: the request origin is used instead", async () => {
            setEnv("NEXT_PUBLIC_APP_URL", "http://db:3000");
            requestHeaders = { origin: "https://request.example" };

            expect(await linkBase()).toBe("https://request.example");
        });

        test("falls back to localhost when there is no request origin", async () => {
            setEnv("NEXT_PUBLIC_APP_URL", "http://db:3000");

            expect(await linkBase()).toBe("http://localhost:3000");
        });

        test("also replaces a configured address that is not a valid url", async () => {
            setEnv("NEXT_PUBLIC_APP_URL", "not a url");
            requestHeaders = { origin: "https://request.example" };

            expect(await linkBase()).toBe("https://request.example");
        });
    });
});

describe("development reset link logging", () => {
    const logged = () => consoleSpy.log.mock.calls.map((call: unknown[]) => String(call[0])).find((line: string) => line.startsWith("[DEV_RESET_LINK]"));

    test("logs the link and token when the app runs on localhost", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toBe(
            "[DEV_RESET_LINK] email=vee@example.com url=http://localhost:3000/reset-password?token=plain-reset-token token=plain-reset-token",
        );
    });

    test("also treats 127.0.0.1 as local", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3000");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toBeDefined();
    });

    // URL.hostname keeps the brackets of an IPv6 literal ("[::1]"), so the "::1" comparison never matches.
    test("currently does not recognize the IPv6 loopback address as local", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "http://[::1]:3000");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toBeUndefined();
    });

    test("does not log for a public address", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toBeUndefined();
    });

    test("logs for a public address when the development flag is on outside production", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");
        setEnv("CIRCLES_DEV_LOG_PASSWORD_RESET", "true");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toContain("token=plain-reset-token");
    });

    test("ignores the development flag in production", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");
        setEnv("CIRCLES_DEV_LOG_PASSWORD_RESET", "true");
        setEnv("NODE_ENV", "production");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toBeUndefined();
    });

    test("requires the flag to be exactly 'true'", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");
        setEnv("CIRCLES_DEV_LOG_PASSWORD_RESET", "1");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toBeUndefined();
    });

    // The local-address check does not consider NODE_ENV, so a production server that is (mis)configured with a
    // localhost address logs the plain reset token. Pinned as current behavior.
    test("currently logs the token even in production when the base address is local", async () => {
        seedUser();
        setEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
        setEnv("NODE_ENV", "production");

        await requestPasswordResetAction("vee@example.com");

        expect(logged()).toContain("token=plain-reset-token");
    });
});

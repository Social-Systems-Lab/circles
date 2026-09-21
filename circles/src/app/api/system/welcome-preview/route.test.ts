import { beforeEach, describe, expect, mock, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const ensureWelcomeMessageForNewUser = mock(async (..._args: unknown[]) => ({ conversationId: "conv-1", messageCreated: true }));
mock.module("@/lib/data/mongo-chat", () => ({ ensureWelcomeMessageForNewUser }));

const resolved = { config: { source: "system_welcome", version: "v2" }, senderDid: "system:kamooni", templateSource: "default" };
const getResolvedWelcomeTemplate = mock(async () => resolved);
mock.module("@/lib/data/system-message-templates", () => ({ getResolvedWelcomeTemplate }));

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    ensureWelcomeMessageForNewUser.mockReset();
    ensureWelcomeMessageForNewUser.mockResolvedValue({ conversationId: "conv-1", messageCreated: true });
    getResolvedWelcomeTemplate.mockReset();
    getResolvedWelcomeTemplate.mockResolvedValue(resolved);
});


describe("POST /api/system/welcome-preview", () => {
    test("creates the welcome message for the signed-in user from the resolved template", async () => {
        const response = await POST();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            conversationId: "conv-1",
            messageCreated: true,
            source: "system_welcome",
            version: "v2",
            templateSource: "default",
        });
        expect(ensureWelcomeMessageForNewUser).toHaveBeenCalledWith("did:user", resolved.config, "system:kamooni");
    });

    test("reports when the message already existed", async () => {
        ensureWelcomeMessageForNewUser.mockResolvedValue({ conversationId: "conv-1", messageCreated: false });

        expect((await (await POST()).json()).messageCreated).toBe(false);
    });

    test("rejects signed-out callers without creating anything", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await POST();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(getResolvedWelcomeTemplate).not.toHaveBeenCalled();
        expect(ensureWelcomeMessageForNewUser).not.toHaveBeenCalled();
    });

    test.each([
        ["resolving the template", () => getResolvedWelcomeTemplate.mockRejectedValue(new Error("db down"))],
        ["creating the message", () => ensureWelcomeMessageForNewUser.mockRejectedValue(new Error("chat down"))],
    ])("returns a generic 500 when %s fails, and logs the error", async (_label, arrange) => {
        arrange();

        const response = await POST();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("POST /api/system/welcome-preview failed:", expect.any(Error));
    });
});

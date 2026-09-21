import { describe, expect, mock, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const { trackEvent } = await import("./actions");

const consoleSpy = silenceConsole("log", "error");

describe("trackEvent", () => {
    test("logs the event with the signed-in user and its properties", async () => {
        await trackEvent("signup_completed", { plan: "free" });

        expect(consoleSpy.log).toHaveBeenCalledWith("Analytics event:", "signup_completed", { userDid: "did:user", plan: "free" });
    });

    test("logs anonymous events without a user did", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        await trackEvent("page_view", { path: "/" });

        expect(consoleSpy.log).toHaveBeenCalledWith("Analytics event:", "page_view", { userDid: undefined, path: "/" });
    });

    test("lets a userDid property override the authenticated user", async () => {
        await trackEvent("spoof", { userDid: "did:someone-else" });

        expect(consoleSpy.log.mock.calls[0][2].userDid).toBe("did:someone-else");
    });

    test("accepts an empty property bag", async () => {
        await trackEvent("ping", {});

        expect(consoleSpy.log).toHaveBeenCalledWith("Analytics event:", "ping", { userDid: "did:user" });
    });

    test("never rejects when authentication fails, and logs the error instead", async () => {
        getAuthenticatedUserDid.mockRejectedValue(new Error("bad token"));

        await expect(trackEvent("ping", {})).resolves.toBeUndefined();

        expect(consoleSpy.error).toHaveBeenCalledWith("Error tracking event:", expect.any(Error));
        expect(consoleSpy.log).not.toHaveBeenCalled();
    });
});

import { describe, expect, test } from "bun:test";
import { DEFAULT_TEST_USER_DID, mockAuthModule } from "./mock-auth";

describe("mockAuthenticatedUser and mockAuthModule", () => {
    const { getAuthenticatedUserDid, isAuthorized } = mockAuthModule();

    test("signs in as the default test user", async () => {
        expect(DEFAULT_TEST_USER_DID).toBe("did:user");
        expect(await getAuthenticatedUserDid()).toBe("did:user");
    });

    test("can be signed out for a single test", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect(await getAuthenticatedUserDid()).toBeUndefined();
    });

    test("is back to the default user for the next test", async () => {
        expect(await getAuthenticatedUserDid()).toBe("did:user");
    });

    test("can be made to fail", async () => {
        getAuthenticatedUserDid.mockRejectedValue(new Error("bad token"));

        await expect(getAuthenticatedUserDid()).rejects.toThrow("bad token");
    });

    test("forgets earlier calls between tests", async () => {
        expect(getAuthenticatedUserDid).not.toHaveBeenCalled();
    });

    test("is installed as the auth module", async () => {
        const auth = await import("@/lib/auth/auth");

        expect(await auth.getAuthenticatedUserDid()).toBe("did:user");
    });

    test("also provides an isAuthorized mock that allows everything by default", async () => {
        expect(await isAuthorized("did:user", "circle-1", {})).toBe(true);
    });

    test("lets a test deny authorization, then allows again for the next test", async () => {
        isAuthorized.mockResolvedValue(false);

        expect(await isAuthorized("did:user", "circle-1", {})).toBe(false);
    });

    test("is authorized again for the next test", async () => {
        expect(await isAuthorized("did:user", "circle-1", {})).toBe(true);
        expect(isAuthorized).toHaveBeenCalledTimes(1);
    });
});

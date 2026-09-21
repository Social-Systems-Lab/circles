import { describe, expect, test } from "bun:test";
import { mockAuthenticatedUser } from "./mock-auth";

// A different default needs its own file: the helper installs the module mock for the whole file.
describe("mockAuthenticatedUser(null)", () => {
    const getAuthenticatedUserDid = mockAuthenticatedUser(null);

    test("starts signed out", async () => {
        expect(await getAuthenticatedUserDid()).toBeUndefined();
    });

    test("can sign someone in for a single test", async () => {
        getAuthenticatedUserDid.mockResolvedValue("did:admin");

        expect(await getAuthenticatedUserDid()).toBe("did:admin");
    });

    test("is signed out again for the next test", async () => {
        expect(await getAuthenticatedUserDid()).toBeUndefined();
    });

    test("is what the auth module resolves", async () => {
        const auth = await import("@/lib/auth/auth");

        expect(await auth.getAuthenticatedUserDid()).toBeUndefined();
    });
});

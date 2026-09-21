import { describe, expect, mock, test } from "bun:test";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const getAuthenticatedUserDid = mockAuthenticatedUser(null);

const { getAuthenticatedUserDidAction } = await import("./auth");

describe("getAuthenticatedUserDidAction", () => {
    test("returns the authenticated user's did", async () => {
        getAuthenticatedUserDid.mockResolvedValue("did:alice");

        expect(await getAuthenticatedUserDidAction()).toBe("did:alice");
        expect(getAuthenticatedUserDid).toHaveBeenCalledTimes(1);
    });

    test("returns undefined when nobody is signed in", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect(await getAuthenticatedUserDidAction()).toBeUndefined();
    });

    test("does not swallow authentication errors", async () => {
        getAuthenticatedUserDid.mockRejectedValue(new Error("invalid token"));

        await expect(getAuthenticatedUserDidAction()).rejects.toThrow("invalid token");
    });
});

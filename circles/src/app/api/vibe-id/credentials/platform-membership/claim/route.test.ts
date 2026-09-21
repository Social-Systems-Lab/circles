import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const createPlatformMembershipCredentialEnvelope = mock(
    async (_input: { subjectVibeDid: string }): Promise<Record<string, unknown> | null> => ({ kind: "credential.v1" }),
);
mock.module("@/lib/vibe-id/membership-credentials", () => ({ createPlatformMembershipCredentialEnvelope }));

const route = await import("./route");

const claim = (query: string) => route.GET(createRequest(`/api/vibe-id/credentials/platform-membership/claim${query}`));

beforeEach(() => {
    createPlatformMembershipCredentialEnvelope.mockReset();
    createPlatformMembershipCredentialEnvelope.mockResolvedValue({ kind: "credential.v1" });
});

describe("GET platform-membership/claim", () => {
    test("issues the credential envelope for the subject", async () => {
        const response = await claim("?subjectDid=did:vibe:1");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ kind: "credential.v1" });
        expect(createPlatformMembershipCredentialEnvelope).toHaveBeenCalledWith({ subjectVibeDid: "did:vibe:1" });
    });

    test("trims the subject", async () => {
        await claim("?subjectDid=%20did:vibe:1%20");

        expect(createPlatformMembershipCredentialEnvelope).toHaveBeenCalledWith({ subjectVibeDid: "did:vibe:1" });
    });

    test.each(["", "?subjectDid=", "?subjectDid=%20", "?circleId=c1"])("rejects the query %p without issuing anything", async (query) => {
        const response = await claim(query);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ success: false, message: "Missing subjectDid." });
        expect(createPlatformMembershipCredentialEnvelope).not.toHaveBeenCalled();
    });

    test("answers 404 when the VibeID has no membership credential", async () => {
        createPlatformMembershipCredentialEnvelope.mockResolvedValue(null);

        const response = await claim("?subjectDid=did:vibe:1");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ success: false, message: "Membership credential is not available for this VibeID." });
    });

    testNodeRuntimeRoute(route);
});

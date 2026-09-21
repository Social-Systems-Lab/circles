import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const createCircleMembershipCredentialEnvelope = mock(
    async (_input: { circleId: string; subjectVibeDid: string }): Promise<Record<string, unknown> | null> => ({ kind: "credential.v1" }),
);
mock.module("@/lib/vibe-id/membership-credentials", () => ({ createCircleMembershipCredentialEnvelope }));

const route = await import("./route");

const claim = (query: string) => route.GET(createRequest(`/api/vibe-id/credentials/circle-membership/claim${query}`));

beforeEach(() => {
    createCircleMembershipCredentialEnvelope.mockReset();
    createCircleMembershipCredentialEnvelope.mockResolvedValue({ kind: "credential.v1" });
});

describe("GET circle-membership/claim", () => {
    test("issues the credential envelope for the circle and subject", async () => {
        const response = await claim("?circleId=c1&subjectDid=did:vibe:1");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ kind: "credential.v1" });
        expect(createCircleMembershipCredentialEnvelope).toHaveBeenCalledWith({ circleId: "c1", subjectVibeDid: "did:vibe:1" });
    });

    test("trims both parameters", async () => {
        await claim("?circleId=%20c1%20&subjectDid=%20did:vibe:1%20");

        expect(createCircleMembershipCredentialEnvelope).toHaveBeenCalledWith({ circleId: "c1", subjectVibeDid: "did:vibe:1" });
    });

    test.each(["", "?circleId=c1", "?subjectDid=did:vibe:1", "?circleId=&subjectDid=x", "?circleId=%20&subjectDid=x"])(
        "rejects the incomplete query %p without issuing anything",
        async (query) => {
            const response = await claim(query);

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ success: false, message: "Missing circleId or subjectDid." });
            expect(createCircleMembershipCredentialEnvelope).not.toHaveBeenCalled();
        },
    );

    test("answers 404 when no credential is available for the identity and circle", async () => {
        createCircleMembershipCredentialEnvelope.mockResolvedValue(null);

        const response = await claim("?circleId=c1&subjectDid=did:vibe:1");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ success: false, message: "Credential is not available for this identity and circle." });
    });

    testNodeRuntimeRoute(route);
});

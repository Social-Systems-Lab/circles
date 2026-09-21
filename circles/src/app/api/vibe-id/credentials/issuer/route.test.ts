import { beforeEach, describe, expect, mock, test } from "bun:test";
import { testNodeRuntimeRoute } from "@/test/route-config";

const getMembershipCredentialIssuerMetadata = mock((): Record<string, unknown> | null => ({ issuerDid: "did:issuer", keys: [] }));
mock.module("@/lib/vibe-id/membership-credentials", () => ({ getMembershipCredentialIssuerMetadata }));

const route = await import("./route");

beforeEach(() => {
    getMembershipCredentialIssuerMetadata.mockReset();
    getMembershipCredentialIssuerMetadata.mockReturnValue({ issuerDid: "did:issuer", keys: [] });
});

describe("GET /api/vibe-id/credentials/issuer", () => {
    test("publishes the issuer metadata", async () => {
        const response = await route.GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ issuerDid: "did:issuer", keys: [] });
    });

    test("reports 503 when no issuer is configured", async () => {
        getMembershipCredentialIssuerMetadata.mockReturnValue(null);

        const response = await route.GET();

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ success: false, message: "Credential issuer is not configured." });
    });

    testNodeRuntimeRoute(route);
});

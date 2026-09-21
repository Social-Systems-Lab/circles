import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";
import { createJsonRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const db = mockDb();

const getMember = mock(async (_did: string, _circleId: string): Promise<Record<string, unknown> | null> => null);
mock.module("@/lib/data/member", () => ({ getMember }));

type Verification =
    | { ok: true; subjectDid: string; circleId: string; credentialId: string; roles: string[] }
    | { ok: false; error: string; message: string };
const valid: Verification = { ok: true, subjectDid: "did:vibe:1", circleId: "c1", credentialId: "cred-1", roles: ["members"] };
const verifyCircleMembershipCredentialEnvelope = mock((_envelope: unknown): Verification => valid);
mock.module("@/lib/vibe-id/membership-credentials", () => ({ verifyCircleMembershipCredentialEnvelope }));

const route = await import("./route");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const verify = (body: unknown) => route.POST(createJsonRequest(body));

const seedLinkedUser = () =>
    db.Circles.docs.push({
        _id: new ObjectId(),
        did: "did:kamooni:1",
        circleType: "user",
        metadata: { authProviders: { vibeId: { did: "did:vibe:1" } } },
    });

beforeEach(() => {
    db.Circles.docs = [];
    getMember.mockReset();
    getMember.mockResolvedValue(null);
    verifyCircleMembershipCredentialEnvelope.mockReset();
    verifyCircleMembershipCredentialEnvelope.mockReturnValue(valid);
});

describe("POST circle-membership/verify", () => {
    describe("the envelope", () => {
        test("accepts a bare credential as the body", async () => {
            const credential = { kind: "credential.v1", payload: {} };

            await verify(credential);

            expect(verifyCircleMembershipCredentialEnvelope).toHaveBeenCalledWith(credential);
        });

        test("accepts a wrapper object with an envelope property", async () => {
            const envelope = { kind: "credential.v1", payload: {} };

            await verify({ envelope });

            expect(verifyCircleMembershipCredentialEnvelope).toHaveBeenCalledWith(envelope);
        });

        test("unwraps only a body that is not itself a credential", async () => {
            const inner = { kind: "credential.v1", nested: true };

            await verify({ kind: "credential.v1", envelope: inner });

            expect(verifyCircleMembershipCredentialEnvelope.mock.calls[0][0]).toEqual({ kind: "credential.v1", envelope: inner });
        });

        test.each([["not JSON", "{broken"], ["null", null], ["an empty object", {}]])("passes %s on as a missing envelope", async (_label, body) => {
            verifyCircleMembershipCredentialEnvelope.mockReturnValue({ ok: false, error: "invalid_envelope", message: "Bad envelope." });

            const response = await verify(body);

            expect(response.status).toBe(400);
            expect(verifyCircleMembershipCredentialEnvelope).toHaveBeenCalledWith(undefined);
        });
    });

    test("denies with the verifier's error and a 400 when the credential is invalid", async () => {
        verifyCircleMembershipCredentialEnvelope.mockReturnValue({ ok: false, error: "bad_signature", message: "Signature mismatch." });

        const response = await verify({ kind: "credential.v1" });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ ok: false, access: "denied", error: "bad_signature", message: "Signature mismatch." });
        expect(getMember).not.toHaveBeenCalled();
    });

    test("denies, with a 200, a valid credential whose subject is not linked to an account", async () => {
        const response = await verify({ kind: "credential.v1" });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: false,
            access: "denied",
            error: "subject_not_found",
            message: "Credential subject is not linked to a Kamooni account.",
        });
        expect(getMember).not.toHaveBeenCalled();
    });

    test("grants access to a current member and reports their live roles", async () => {
        seedLinkedUser();
        getMember.mockResolvedValue({ userGroups: ["members", "moderators"] });

        const response = await verify({ kind: "credential.v1" });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
            access: "granted",
            credentialId: "cred-1",
            subjectDid: "did:vibe:1",
            circleId: "c1",
            roles: ["members", "moderators"],
            checkedAt: NOW.toISOString(),
        });
        expect(getMember).toHaveBeenCalledWith("did:kamooni:1", "c1");
    });

    test("denies a credential whose holder is no longer a member, even though the credential is valid", async () => {
        seedLinkedUser();

        expect(await (await verify({ kind: "credential.v1" })).json()).toEqual({
            ok: false,
            access: "denied",
            credentialId: "cred-1",
            subjectDid: "did:vibe:1",
            circleId: "c1",
            roles: ["members"],
            checkedAt: NOW.toISOString(),
            error: "membership_not_active",
        });
    });

    test("prefers the live roles over those recorded in the credential", async () => {
        seedLinkedUser();
        getMember.mockResolvedValue({ userGroups: ["admins"] });

        const body = await (await verify({ kind: "credential.v1" })).json();

        expect(body.roles).toEqual(["admins"]);
        expect(body.access).toBe("denied");
    });

    test("falls back to the credential's roles when the user has no membership at all", async () => {
        seedLinkedUser();

        expect((await (await verify({ kind: "credential.v1" })).json()).roles).toEqual(["members"]);
    });

    test("checks the circle named in the credential, not one supplied by the caller", async () => {
        seedLinkedUser();
        getMember.mockResolvedValue({ userGroups: ["members"] });

        await verify({ kind: "credential.v1", circleId: "attacker-circle" });

        expect(getMember).toHaveBeenCalledWith("did:kamooni:1", "c1");
    });

    testNodeRuntimeRoute(route);
});

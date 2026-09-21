import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";
import { createRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const db = mockDb();

const isPlatformMember = mock((_user: unknown) => true);
mock.module("@/lib/vibe-id/membership-credentials", () => ({ isPlatformMember }));

const route = await import("./route");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const status = (query: string) => route.GET(createRequest(`/api/vibe-id/credentials/platform-membership/status${query}`));

const seedLinkedUser = (overrides: Record<string, unknown> = {}) =>
    db.Circles.docs.push({
        _id: new ObjectId(),
        did: "did:kamooni:1",
        circleType: "user",
        metadata: { authProviders: { vibeId: { did: "did:vibe:1" } } },
        ...overrides,
    });

beforeEach(() => {
    db.Circles.docs = [];
    isPlatformMember.mockReset();
    isPlatformMember.mockReturnValue(true);
});

describe("GET platform-membership/status", () => {
    test("reports an active membership when the linked user is a platform member", async () => {
        seedLinkedUser();

        const response = await status("?subjectDid=did:vibe:1");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "active", checkedAt: NOW.toISOString() });
        expect(isPlatformMember).toHaveBeenCalledWith(expect.objectContaining({ did: "did:kamooni:1" }));
    });

    test("reports the membership as revoked when the user is no longer a platform member", async () => {
        seedLinkedUser();
        isPlatformMember.mockReturnValue(false);

        expect(await (await status("?subjectDid=did:vibe:1")).json()).toEqual({
            status: "revoked",
            checkedAt: NOW.toISOString(),
            reason: "membership_not_active",
        });
    });

    test("reports the credential as revoked when no account is linked to the VibeID", async () => {
        expect(await (await status("?subjectDid=did:vibe:unknown")).json()).toEqual({
            status: "revoked",
            checkedAt: NOW.toISOString(),
            reason: "subject_not_found",
        });
        expect(isPlatformMember).not.toHaveBeenCalled();
    });

    test("only considers user profiles linked to that VibeID", async () => {
        seedLinkedUser({ metadata: { authProviders: { vibeId: { did: "did:vibe:other" } } } });
        db.Circles.docs.push({ _id: new ObjectId(), circleType: "circle", metadata: { authProviders: { vibeId: { did: "did:vibe:1" } } } });

        expect((await (await status("?subjectDid=did:vibe:1")).json()).reason).toBe("subject_not_found");
    });

    test("trims the subject", async () => {
        seedLinkedUser();

        expect((await (await status("?subjectDid=%20did:vibe:1%20")).json()).status).toBe("active");
    });

    test.each(["", "?subjectDid=", "?subjectDid=%20", "?circleId=c1"])("answers 400 with an unknown status for the query %p", async (query) => {
        const response = await status(query);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ status: "unknown", message: "Missing subjectDid." });
    });

    testNodeRuntimeRoute(route);
});

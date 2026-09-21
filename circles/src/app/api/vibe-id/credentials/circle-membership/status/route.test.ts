import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";
import { createRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const db = mockDb();

const getMember = mock(async (_did: string, _circleId: string): Promise<Record<string, unknown> | null> => null);
mock.module("@/lib/data/member", () => ({ getMember }));

const route = await import("./route");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const status = (query: string) => route.GET(createRequest(`/api/vibe-id/credentials/circle-membership/status${query}`));

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
    getMember.mockReset();
    getMember.mockResolvedValue(null);
});

describe("GET circle-membership/status", () => {
    test("reports an active membership for a linked user who is a member of the circle", async () => {
        seedLinkedUser();
        getMember.mockResolvedValue({ userGroups: ["members"] });

        const response = await status("?circleId=c1&subjectDid=did:vibe:1");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "active", checkedAt: NOW.toISOString() });
        expect(getMember).toHaveBeenCalledWith("did:kamooni:1", "c1");
    });

    test("trims both parameters", async () => {
        seedLinkedUser();
        getMember.mockResolvedValue({ userGroups: ["members"] });

        await status("?circleId=%20c1%20&subjectDid=%20did:vibe:1%20");

        expect(getMember).toHaveBeenCalledWith("did:kamooni:1", "c1");
    });

    test("reports the membership as revoked when the user is not a member", async () => {
        seedLinkedUser();

        expect(await (await status("?circleId=c1&subjectDid=did:vibe:1")).json()).toEqual({
            status: "revoked",
            checkedAt: NOW.toISOString(),
            reason: "membership_not_active",
        });
    });

    test.each([["admins only", ["admins"]], ["no groups", []], ["missing groups", undefined]])(
        "does not count a member with %s as an active member",
        async (_label, userGroups) => {
            seedLinkedUser();
            getMember.mockResolvedValue({ userGroups });

            expect((await (await status("?circleId=c1&subjectDid=did:vibe:1")).json()).status).toBe("revoked");
        },
    );

    test("reports the credential as revoked when no account is linked to the VibeID, without a membership lookup", async () => {
        expect(await (await status("?circleId=c1&subjectDid=did:vibe:unknown")).json()).toEqual({
            status: "revoked",
            checkedAt: NOW.toISOString(),
            reason: "subject_not_found",
        });
        expect(getMember).not.toHaveBeenCalled();
    });

    test("ignores circles and users that are linked to a different VibeID", async () => {
        seedLinkedUser({ metadata: { authProviders: { vibeId: { did: "did:vibe:other" } } } });
        db.Circles.docs.push({ _id: new ObjectId(), did: "did:c", circleType: "circle", metadata: { authProviders: { vibeId: { did: "did:vibe:1" } } } });

        expect((await (await status("?circleId=c1&subjectDid=did:vibe:1")).json()).reason).toBe("subject_not_found");
    });

    test("treats a linked user without a did as not found", async () => {
        seedLinkedUser({ did: undefined });

        expect((await (await status("?circleId=c1&subjectDid=did:vibe:1")).json()).reason).toBe("subject_not_found");
    });

    test.each(["", "?circleId=c1", "?subjectDid=did:vibe:1", "?circleId=%20&subjectDid=%20"])(
        "answers 400 with an unknown status for the incomplete query %p",
        async (query) => {
            const response = await status(query);

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ status: "unknown", message: "Missing circleId or subjectDid." });
            expect(getMember).not.toHaveBeenCalled();
        },
    );

    testNodeRuntimeRoute(route);
});

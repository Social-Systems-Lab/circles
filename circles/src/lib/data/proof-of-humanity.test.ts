import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const circlesByDid = new Map<string, Record<string, unknown>>();
const getCirclesByDids = mock(async (dids: string[]) => dids.flatMap((did) => (circlesByDid.has(did) ? [circlesByDid.get(did)!] : [])));
mock.module("@/lib/data/circle", () => ({ getCirclesByDids }));

const humanity = await import("./proof-of-humanity");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

const seed = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.HumanityVerifications.docs.push({
        _id,
        verifierDid: "did:verifier",
        subjectDid: "did:subject",
        level: "real_person",
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    });
    return _id;
};
const stored = (id: ObjectId) => db.HumanityVerifications.byId(id)!;

beforeEach(() => {
    db.HumanityVerifications.docs = [];
    circlesByDid.clear();
    getCirclesByDids.mockClear();
});

describe("getHumanityVerificationSummary", () => {
    test("is empty for a profile nobody has verified", async () => {
        expect(await humanity.getHumanityVerificationSummary("did:subject", "did:viewer")).toEqual({
            realPersonCount: 0,
            metInRealLifeCount: 0,
            totalActiveCount: 0,
            verifications: [],
            viewerVerification: null,
            canCurrentViewerVerify: true,
            isOwnProfile: false,
        });
        expect(getCirclesByDids).not.toHaveBeenCalled();
    });

    test("counts active verifications by level", async () => {
        seed({ verifierDid: "did:a", level: "real_person" });
        seed({ verifierDid: "did:b", level: "real_person" });
        seed({ verifierDid: "did:c", level: "met_in_real_life" });

        const summary = await humanity.getHumanityVerificationSummary("did:subject");

        expect(summary).toMatchObject({ realPersonCount: 2, metInRealLifeCount: 1, totalActiveCount: 3 });
    });

    test("leaves out revoked verifications and those about other people", async () => {
        seed({ verifierDid: "did:a" });
        seed({ verifierDid: "did:b", revokedAt: day(1) });
        seed({ verifierDid: "did:c", subjectDid: "did:someone-else" });

        const summary = await humanity.getHumanityVerificationSummary("did:subject");

        expect(summary.totalActiveCount).toBe(1);
        expect(summary.verifications[0].verifierDid).toBe("did:a");
    });

    test("treats a verification with a null revocation as active", async () => {
        seed({ revokedAt: null });

        expect((await humanity.getHumanityVerificationSummary("did:subject")).totalActiveCount).toBe(1);
    });

    test("lists in-person verifications before online ones, newest first within each", async () => {
        seed({ verifierDid: "did:old-online", level: "real_person", createdAt: day(5) });
        seed({ verifierDid: "did:new-online", level: "real_person", createdAt: day(1) });
        seed({ verifierDid: "did:old-irl", level: "met_in_real_life", createdAt: day(4) });
        seed({ verifierDid: "did:new-irl", level: "met_in_real_life", createdAt: day(2) });

        const summary = await humanity.getHumanityVerificationSummary("did:subject");

        expect(summary.verifications.map((v) => v.verifierDid)).toEqual(["did:new-irl", "did:old-irl", "did:new-online", "did:old-online"]);
    });

    test("attaches the verifier's profile, or null when it cannot be found", async () => {
        circlesByDid.set("did:a", { did: "did:a", name: "Ada" });
        seed({ verifierDid: "did:a" });
        seed({ verifierDid: "did:ghost" });

        const summary = await humanity.getHumanityVerificationSummary("did:subject");

        expect(summary.verifications.find((v) => v.verifierDid === "did:a")?.verifier).toEqual({ did: "did:a", name: "Ada" });
        expect(summary.verifications.find((v) => v.verifierDid === "did:ghost")?.verifier).toBeNull();
    });

    test("looks each verifier up once", async () => {
        seed({ verifierDid: "did:a", level: "real_person" });
        seed({ verifierDid: "did:a", level: "met_in_real_life" });
        seed({ verifierDid: "did:b" });

        await humanity.getHumanityVerificationSummary("did:subject");

        expect(getCirclesByDids).toHaveBeenCalledTimes(1);
        expect(getCirclesByDids.mock.calls[0][0].sort()).toEqual(["did:a", "did:b"]);
    });

    test("returns record ids as strings", async () => {
        const id = seed();

        expect((await humanity.getHumanityVerificationSummary("did:subject")).verifications[0]._id).toBe(id.toString());
    });

    describe("the viewer", () => {
        test("finds the viewer's own verification", async () => {
            seed({ verifierDid: "did:viewer", level: "met_in_real_life" });
            seed({ verifierDid: "did:other" });

            const summary = await humanity.getHumanityVerificationSummary("did:subject", "did:viewer");

            expect(summary.viewerVerification).toMatchObject({ verifierDid: "did:viewer", level: "met_in_real_life" });
            expect(summary.canCurrentViewerVerify).toBe(true);
            expect(summary.isOwnProfile).toBe(false);
        });

        test("has no verification of their own when they have not verified", async () => {
            seed({ verifierDid: "did:other" });

            expect((await humanity.getHumanityVerificationSummary("did:subject", "did:viewer")).viewerVerification).toBeNull();
        });

        test("cannot verify themselves, and owns the profile", async () => {
            const summary = await humanity.getHumanityVerificationSummary("did:subject", "did:subject");

            expect(summary.canCurrentViewerVerify).toBe(false);
            expect(summary.isOwnProfile).toBe(true);
        });

        test.each([[undefined], [null], [""]])("cannot verify anything when signed out (%p)", async (viewerDid) => {
            seed({ verifierDid: "did:other" });

            const summary = await humanity.getHumanityVerificationSummary("did:subject", viewerDid);

            expect(summary).toMatchObject({ viewerVerification: null, canCurrentViewerVerify: false, isOwnProfile: false });
        });
    });
});

describe("getActiveHumanityVerification", () => {
    test("returns the verifier's active verification of the subject", async () => {
        const id = seed();

        expect((await humanity.getActiveHumanityVerification("did:verifier", "did:subject"))?._id).toEqual(id);
    });

    test("returns null without one", async () => {
        expect(await humanity.getActiveHumanityVerification("did:verifier", "did:subject")).toBeNull();
    });

    test("ignores revoked verifications and other verifiers or subjects", async () => {
        seed({ revokedAt: day(1) });
        seed({ verifierDid: "did:other" });
        seed({ subjectDid: "did:other" });

        expect(await humanity.getActiveHumanityVerification("did:verifier", "did:subject")).toBeNull();
    });
});

describe("createOrUpdateHumanityVerification", () => {
    const input = { verifierDid: "did:verifier", subjectDid: "did:subject", level: "real_person" as const };

    describe("creating", () => {
        test("stores a new verification and reports it as created", async () => {
            const result = await humanity.createOrUpdateHumanityVerification({ ...input, note: "Met at the fair" });

            expect(result.changeType).toBe("created");
            expect(result.verification).toMatchObject({
                verifierDid: "did:verifier",
                subjectDid: "did:subject",
                level: "real_person",
                note: "Met at the fair",
                createdAt: NOW,
                updatedAt: NOW,
            });
            expect(result.verification?._id).toBeString();
            expect(db.HumanityVerifications.docs).toHaveLength(1);
        });

        test("trims the note and keeps at most 280 characters", async () => {
            const trimmed = await humanity.createOrUpdateHumanityVerification({ ...input, note: "  hello  " });
            expect(trimmed.verification?.note).toBe("hello");

            db.HumanityVerifications.docs = [];
            const long = await humanity.createOrUpdateHumanityVerification({ ...input, note: "x".repeat(500) });
            expect(long.verification?.note).toHaveLength(280);
        });

        test.each([[undefined], [""], ["   \n"]])("stores no note for %p", async (note) => {
            const result = await humanity.createOrUpdateHumanityVerification({ ...input, note });

            expect(result.verification?.note).toBeUndefined();
        });

        test("creates a separate verification for a different subject or verifier", async () => {
            await humanity.createOrUpdateHumanityVerification(input);
            await humanity.createOrUpdateHumanityVerification({ ...input, subjectDid: "did:other" });
            await humanity.createOrUpdateHumanityVerification({ ...input, verifierDid: "did:other-verifier" });

            expect(db.HumanityVerifications.docs).toHaveLength(3);
        });

        test("creates a new record when the earlier one was revoked", async () => {
            seed({ revokedAt: day(1) });

            const result = await humanity.createOrUpdateHumanityVerification(input);

            expect(result.changeType).toBe("created");
            expect(db.HumanityVerifications.docs).toHaveLength(2);
        });
    });

    describe("updating", () => {
        test("reports raising a real-person verification to in-person as an upgrade", async () => {
            const id = seed({ level: "real_person" });

            const result = await humanity.createOrUpdateHumanityVerification({ ...input, level: "met_in_real_life" });

            expect(result.changeType).toBe("upgraded");
            expect(result.verification?.level).toBe("met_in_real_life");
            expect(stored(id).level).toBe("met_in_real_life");
        });

        test("reports lowering the level as a plain update", async () => {
            seed({ level: "met_in_real_life" });

            expect((await humanity.createOrUpdateHumanityVerification(input)).changeType).toBe("updated");
        });

        test("reports re-submitting the same level as an update", async () => {
            seed({ level: "real_person" });

            expect((await humanity.createOrUpdateHumanityVerification(input)).changeType).toBe("updated");
        });

        test("keeps a single record and refreshes its update time but not its creation time", async () => {
            const id = seed({ createdAt: day(3), updatedAt: day(3) });

            await humanity.createOrUpdateHumanityVerification({ ...input, level: "met_in_real_life" });

            expect(db.HumanityVerifications.docs).toHaveLength(1);
            expect(stored(id)).toMatchObject({ createdAt: day(3), updatedAt: NOW });
        });

        test("replaces the note when a new one is given", async () => {
            const id = seed({ note: "old" });

            await humanity.createOrUpdateHumanityVerification({ ...input, note: "  new  " });

            expect(stored(id).note).toBe("new");
        });

        test.each([[undefined], [""], ["  "]])("removes the note when the new one is %p", async (note) => {
            const id = seed({ note: "old" });

            const result = await humanity.createOrUpdateHumanityVerification({ ...input, note });

            expect(stored(id).note).toBeUndefined();
            expect(result.verification?.note).toBeUndefined();
        });

        test("returns the record id as a string", async () => {
            const id = seed();

            expect((await humanity.createOrUpdateHumanityVerification(input)).verification?._id).toBe(id.toString());
        });
    });
});

describe("revokeHumanityVerification", () => {
    test("revokes the verification and reports true", async () => {
        const id = seed();

        expect(await humanity.revokeHumanityVerification("did:verifier", "did:subject")).toBe(true);

        expect(stored(id)).toMatchObject({ revokedAt: NOW, updatedAt: NOW });
    });

    test("keeps the record for audit rather than deleting it", async () => {
        seed();

        await humanity.revokeHumanityVerification("did:verifier", "did:subject");

        expect(db.HumanityVerifications.docs).toHaveLength(1);
    });

    test("stops counting the verification", async () => {
        seed();
        await humanity.revokeHumanityVerification("did:verifier", "did:subject");

        expect((await humanity.getHumanityVerificationSummary("did:subject")).totalActiveCount).toBe(0);
    });

    test("reports false when there is nothing to revoke", async () => {
        expect(await humanity.revokeHumanityVerification("did:verifier", "did:subject")).toBe(false);
    });

    test("reports false for a verification that is already revoked", async () => {
        const id = seed({ revokedAt: day(2) });

        expect(await humanity.revokeHumanityVerification("did:verifier", "did:subject")).toBe(false);
        expect(stored(id).revokedAt).toEqual(day(2));
    });

    test("only revokes the verification of that verifier for that subject", async () => {
        const target = seed();
        const other = seed({ verifierDid: "did:other" });

        await humanity.revokeHumanityVerification("did:verifier", "did:subject");

        expect(stored(target).revokedAt).toBeDefined();
        expect(stored(other).revokedAt).toBeUndefined();
    });

    test("allows verifying again afterwards", async () => {
        seed();
        await humanity.revokeHumanityVerification("did:verifier", "did:subject");

        const result = await humanity.createOrUpdateHumanityVerification({ verifierDid: "did:verifier", subjectDid: "did:subject", level: "real_person" });

        expect(result.changeType).toBe("created");
    });
});

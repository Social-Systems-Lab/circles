import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { insertEventOccurrenceInvitation, upsertEventOccurrenceInvitation } = await import("./eventOccurrenceInvitation");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const LATER = new Date(NOW.getTime() + 60_000);
const OCCURRENCE = Date.UTC(2026, 6, 1, 18, 0, 0);

const invitation = (overrides: Record<string, unknown> = {}) =>
    ({
        seriesId: "series-1",
        occurrenceKey: OCCURRENCE,
        userDid: "did:invitee",
        invitedBy: "did:host",
        circleId: "circle-1",
        ...overrides,
    }) as Parameters<typeof insertEventOccurrenceInvitation>[0];

beforeEach(() => {
    db.EventOccurrenceInvitations.docs = [];
});

describe("insertEventOccurrenceInvitation", () => {
    test("creates the invitation and reports it as inserted", async () => {
        expect(await insertEventOccurrenceInvitation(invitation())).toEqual({ inserted: true });

        expect(db.EventOccurrenceInvitations.docs[0]).toMatchObject({
            ...invitation(),
            createdAt: NOW,
            updatedAt: NOW,
            sentAt: NOW,
        });
    });

    test("does not touch an existing invitation and reports it as not inserted", async () => {
        await insertEventOccurrenceInvitation(invitation({ message: "first" }));
        setSystemTime(LATER);

        expect(await insertEventOccurrenceInvitation(invitation({ message: "second", invitedBy: "did:other" }))).toEqual({
            inserted: false,
        });

        expect(db.EventOccurrenceInvitations.docs).toHaveLength(1);
        expect(db.EventOccurrenceInvitations.docs[0]).toMatchObject({ message: "first", invitedBy: "did:host", sentAt: NOW });
    });

    test("keeps invitations for different users and occurrences separate", async () => {
        await insertEventOccurrenceInvitation(invitation());
        await insertEventOccurrenceInvitation(invitation({ userDid: "did:other" }));
        await insertEventOccurrenceInvitation(invitation({ occurrenceKey: OCCURRENCE + 1 }));
        await insertEventOccurrenceInvitation(invitation({ seriesId: "series-2" }));

        expect(db.EventOccurrenceInvitations.docs).toHaveLength(4);
    });
});

describe("upsertEventOccurrenceInvitation", () => {
    describe("without resending", () => {
        test("inserts a new invitation", async () => {
            expect(await upsertEventOccurrenceInvitation(invitation(), { resendExisting: false })).toEqual({ status: "inserted" });
            expect(db.EventOccurrenceInvitations.docs).toHaveLength(1);
        });

        test("leaves an existing invitation alone and reports it as existing", async () => {
            await upsertEventOccurrenceInvitation(invitation({ message: "first" }), { resendExisting: false });
            setSystemTime(LATER);

            expect(await upsertEventOccurrenceInvitation(invitation({ message: "second" }), { resendExisting: false })).toEqual({
                status: "existing",
            });
            expect(db.EventOccurrenceInvitations.docs[0]).toMatchObject({ message: "first", sentAt: NOW });
        });
    });

    describe("with resending", () => {
        test("inserts a new invitation with its identifying fields set on insert", async () => {
            expect(await upsertEventOccurrenceInvitation(invitation({ message: "hello" }), { resendExisting: true })).toEqual({
                status: "inserted",
            });

            expect(db.EventOccurrenceInvitations.docs[0]).toMatchObject({
                seriesId: "series-1",
                occurrenceKey: OCCURRENCE,
                userDid: "did:invitee",
                invitedBy: "did:host",
                circleId: "circle-1",
                message: "hello",
                createdAt: NOW,
                updatedAt: NOW,
                sentAt: NOW,
            });
        });

        test("refreshes an existing invitation and keeps its creation time", async () => {
            await upsertEventOccurrenceInvitation(invitation({ message: "first" }), { resendExisting: true });
            setSystemTime(LATER);

            const result = await upsertEventOccurrenceInvitation(
                invitation({ message: "second", invitedBy: "did:other-host", circleId: "circle-2" }),
                { resendExisting: true },
            );

            expect(result).toEqual({ status: "updated" });
            expect(db.EventOccurrenceInvitations.docs).toHaveLength(1);
            expect(db.EventOccurrenceInvitations.docs[0]).toMatchObject({
                invitedBy: "did:other-host",
                circleId: "circle-2",
                message: "second",
                createdAt: NOW,
                updatedAt: LATER,
                sentAt: LATER,
            });
        });

        test("removes the previous message when the resend has none", async () => {
            await upsertEventOccurrenceInvitation(invitation({ message: "first" }), { resendExisting: true });
            setSystemTime(LATER);

            await upsertEventOccurrenceInvitation(invitation(), { resendExisting: true });

            expect(db.EventOccurrenceInvitations.docs[0].message).toBeUndefined();
            expect(db.EventOccurrenceInvitations.docs[0].sentAt).toEqual(LATER);
        });

        test("treats an empty message as no message", async () => {
            await upsertEventOccurrenceInvitation(invitation({ message: "first" }), { resendExisting: true });

            await upsertEventOccurrenceInvitation(invitation({ message: "" }), { resendExisting: true });

            expect(db.EventOccurrenceInvitations.docs[0].message).toBeUndefined();
        });

        test("only refreshes the invitation of the matching user and occurrence", async () => {
            await upsertEventOccurrenceInvitation(invitation({ message: "a" }), { resendExisting: true });
            await upsertEventOccurrenceInvitation(invitation({ userDid: "did:other", message: "b" }), { resendExisting: true });
            setSystemTime(LATER);

            await upsertEventOccurrenceInvitation(invitation({ message: "a2" }), { resendExisting: true });

            const other = db.EventOccurrenceInvitations.docs.find((doc) => doc.userDid === "did:other")!;
            expect(other).toMatchObject({ message: "b", sentAt: NOW });
        });
    });
});

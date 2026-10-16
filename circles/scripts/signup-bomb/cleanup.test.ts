import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
    CUTOFF, EXPECTED_CANDIDATE_COUNT, PRESERVED_EMAILS, executePlan, hasStrongActivity, preflight, readAndVerifyManifest, sha256,
    validateManifest, type CandidateIdentity, type Manifest,
} from "./lib";

type Row = Record<string, any>;

function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === "$or") return (expected as Row[]).some((part) => matches(row, part));
        const actual = row[key];
        if (actual instanceof ObjectId && expected instanceof ObjectId) return actual.equals(expected);
        return actual === expected;
    });
}

class FakeCollection {
    constructor(private rows: Row[], private mutations: string[]) {}
    async findOne(filter: Row) { return this.rows.find((row) => matches(row, filter)) ?? null; }
    find(filter: Row = {}) {
        const values = this.rows.filter((row) => matches(row, filter));
        return { toArray: async () => values, async *[Symbol.asyncIterator]() { yield* values; } };
    }
    async deleteOne(filter: Row) {
        const index = this.rows.findIndex((row) => matches(row, filter));
        if (index < 0) return { deletedCount: 0 };
        this.rows.splice(index, 1); this.mutations.push("delete"); return { deletedCount: 1 };
    }
    async replaceOne(filter: Row, replacement: Row) {
        const index = this.rows.findIndex((row) => matches(row, filter));
        if (index < 0) return { matchedCount: 0 };
        this.rows[index] = replacement; this.mutations.push("replace"); return { matchedCount: 1 };
    }
}

class FakeDb {
    mutations: string[] = [];
    constructor(public data: Record<string, Row[]>) {}
    collection(name: string) { this.data[name] ??= []; return new FakeCollection(this.data[name], this.mutations); }
    listCollections() { return { toArray: async () => Object.keys(this.data).map((name) => ({ name })) }; }
}

function account(index: number): CandidateIdentity {
    const id = new ObjectId(Math.floor(new Date("2026-09-10T00:00:00Z").getTime() / 1000) + index);
    return { _id: id.toHexString(), did: `did:kamooni:fake-${index}`, email: `fake${index}@example.test`, handle: `abcdefghijklmn${String(index).padStart(2, "a")}`.slice(0, 20), name: "AbcdefgH IjklmnoP", objectIdTimestamp: id.getTimestamp().toISOString(), isEmailVerified: false, accountStatus: "pending_verification", verificationStatus: "unverified" };
}

function manifest(count = EXPECTED_CANDIDATE_COUNT): Manifest {
    const accounts = Array.from({ length: count }, (_, index) => account(index));
    return { schemaVersion: 1, database: "circles", cutoff: CUTOFF.toISOString(), generatedAt: new Date().toISOString(), candidateCount: count, preservedAccountIds: Array.from({ length: 7 }, () => new ObjectId().toHexString()), accounts };
}

function profiles(value: Manifest): Row[] {
    return [
        ...value.accounts.map((item) => ({ _id: new ObjectId(item._id), circleType: "user", did: item.did, email: item.email, handle: item.handle, name: item.name, isEmailVerified: item.isEmailVerified, accountStatus: item.accountStatus, verificationStatus: item.verificationStatus })),
        ...value.preservedAccountIds.map((id, index) => ({ _id: new ObjectId(id), circleType: "user", email: PRESERVED_EMAILS[index] })),
    ];
}

test("manifest tamper / SHA mismatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "signup-bomb-test-"));
    const path = join(directory, "manifest.json");
    const bytes = `${JSON.stringify(manifest())}\n`;
    await writeFile(path, bytes);
    await assert.rejects(readAndVerifyManifest(path, sha256(`${bytes}tampered`)), /SHA-256 mismatch/);
});

test("preserved-account exclusion", () => {
    const value = manifest(); value.preservedAccountIds[0] = value.accounts[0]._id;
    assert.throws(() => validateManifest(value), /Preserved account/);
});

test("candidate drift or new activity aborts whole preflight", async () => {
    const value = manifest(); const rows = profiles(value); rows[0].email = "changed@example.test";
    await assert.rejects(preflight(new FakeDb({ circles: rows }) as any, value), /Candidate drift/);
    const rows2 = profiles(value);
    await assert.rejects(preflight(new FakeDb({ circles: rows2, posts: [{ _id: new ObjectId(), createdBy: value.accounts[0].did }] }) as any, value), /New meaningful activity/);
});

test("dry-run preflight performs no mutation", async () => {
    const value = manifest(); const db = new FakeDb({ circles: profiles(value), notifications: [{ _id: new ObjectId(), userDid: value.accounts[0].did }] });
    await preflight(db as any, value);
    assert.deepEqual(db.mutations, []);
});

test("execute is idempotent", async () => {
    const value = manifest(); const db = new FakeDb({ circles: profiles(value) });
    const first = await preflight(db as any, value);
    for (const plan of first.plans) assert.equal(await executePlan(db as any, plan), "deleted");
    const second = await preflight(db as any, value);
    for (const plan of second.plans) assert.equal(await executePlan(db as any, plan), "skipped");
    assert.equal(db.data.circles.length, PRESERVED_EMAILS.length);
    assert.deepEqual(db.data.circles.map((row) => row.email).sort(), [...PRESERVED_EMAILS].sort());
});

test("automatic system conversation is narrowly reconciled without deleting it", async () => {
    const value = manifest(); const conversationId = new ObjectId();
    const db = new FakeDb({ circles: profiles(value), chatConversations: [{ _id: conversationId, source: "automatic-welcome", participants: [value.accounts[0].did, "did:system"], participantCount: 2, requiredSchemaField: "kept" }] });
    const checked = await preflight(db as any, value);
    await executePlan(db as any, checked.plans[0]);
    assert.equal(db.data.chatConversations.length, 1);
    assert.deepEqual(db.data.chatConversations[0].participants, ["did:system"]);
    assert.equal(db.data.chatConversations[0].participantCount, 1);
    assert.equal(db.data.chatConversations[0].requiredSchemaField, "kept");
});

test("candidate-authored content aborts", async () => {
    const value = manifest(); const db = new FakeDb({ circles: profiles(value), tasks: [{ _id: new ObjectId(), createdBy: value.accounts[0].did, title: "real task" }] });
    await assert.rejects(preflight(db as any, value), /New meaningful activity/);
    assert.deepEqual(db.mutations, []);
});

test("missing candidate is skipped", async () => {
    const value = manifest(); const rows = profiles(value); rows.shift(); const db = new FakeDb({ circles: rows });
    const checked = await preflight(db as any, value);
    assert.equal(checked.missing.length, 1);
    assert.equal(await executePlan(db as any, checked.plans[0]), "skipped");
});

test("partial prior cleanup removes safe dangling rows", async () => {
    const value = manifest(); const rows = profiles(value); rows.shift();
    const db = new FakeDb({ circles: rows, notifications: [{ _id: new ObjectId(), userDid: value.accounts[0].did }] });
    const checked = await preflight(db as any, value);
    assert.equal(await executePlan(db as any, checked.plans[0]), "skipped");
    assert.equal(db.data.notifications.length, 0);
});

test("exact-303 manifest safety guard", () => {
    assert.throws(() => validateManifest(manifest(302)), /exactly 303/);
    assert.doesNotThrow(() => validateManifest(manifest(303)));
});

test("verified lifecycle state alone does not exclude a zero-activity synthetic account", async () => {
    const verified = account(0);
    verified.isEmailVerified = true;
    verified.accountStatus = "active";
    verified.verificationStatus = "verified";
    assert.deepEqual(await hasStrongActivity(new FakeDb({ circles: [] }) as any, verified), { active: false, reasons: [], observations: [], uncertain: [] });
});

async function assertStrongReference(collection: string, document: Row) {
    const value = manifest();
    const hydrated = JSON.parse(JSON.stringify(document).replaceAll("$DID", value.accounts[0].did).replaceAll("$ID", value.accounts[0]._id));
    hydrated._id = new ObjectId();
    const db = new FakeDb({ circles: profiles(value), [collection]: [hydrated] });
    await assert.rejects(preflight(db as any, value), /New meaningful activity/);
    assert.deepEqual(db.mutations, []);
}

test("field-aware strong activity aborts the whole run", async () => {
    const cases: Array<[string, string, Row]> = [
        ["external membership", "members", { userDid: "$DID", circleId: new ObjectId().toHexString() }],
        ["real relationship/follow", "userRelationships", { fromDid: "$DID", toDid: "did:human", isFollowing: true, connectStatus: "none", dmPermission: "none", dmPermissionSource: "none" }],
        ["outgoing membership request", "membershipRequests", { userDid: "$DID", circleId: new ObjectId().toHexString(), status: "pending" }],
        ["authored reaction", "reactions", { userDid: "$DID", contentId: new ObjectId().toHexString(), contentType: "post", reactionType: "like" }],
        ["RSVP", "eventRsvps", { userDid: "$DID", eventId: new ObjectId().toHexString(), status: "going" }],
        ["task participation/claim", "tasks", { createdBy: "did:human", claims: [{ claimantDid: "$DID", status: "pending" }] }],
        ["outgoing invitation", "eventOccurrenceInvitations", { userDid: "did:human", invitedBy: "$DID", seriesId: new ObjectId().toHexString() }],
        ["verification-message sender", "verificationMessages", { senderDid: "$DID", requestId: new ObjectId().toHexString(), body: "hello" }],
        ["private-media upload", "privateMedia", { uploadedByDid: "$DID", objectKey: "upload" }],
    ];
    for (const [name, collection, document] of cases) {
        await assert.doesNotReject(assertStrongReference(collection, document), name);
    }
});

test("field-aware weak automatic references remain safely disposable", async () => {
    const cases: Array<[string, string, (value: Manifest) => Row]> = [
        ["own-profile self-membership", "members", (value) => ({ userDid: value.accounts[0].did, circleId: value.accounts[0]._id })],
        ["received notification", "notifications", (value) => ({ userId: value.accounts[0].did, type: "welcome" })],
        ["incoming invitation alone", "eventOccurrenceInvitations", (value) => ({ userDid: value.accounts[0].did, invitedBy: "did:human", seriesId: new ObjectId().toHexString() })],
        ["automatic welcome chat artifact", "chatMessageDocs", (value) => ({ senderDid: "did:system", recipientDid: value.accounts[0].did, source: "automatic-welcome", body: "Welcome" })],
    ];
    for (const [name, collection, build] of cases) {
        const value = manifest(); const row = { _id: new ObjectId(), ...build(value) };
        const db = new FakeDb({ circles: profiles(value), [collection]: [row] });
        const checked = await preflight(db as any, value);
        assert.equal(checked.plans[0].deletions.some((reference) => reference.collection === collection), true, name);
    }
});

test("authored chat remains distinguishable from automatic welcome artifacts", async () => {
    await assertStrongReference("chatMessageDocs", { senderDid: "$DID", source: "automatic-welcome", body: "user-authored" });
});

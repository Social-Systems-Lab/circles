import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
    CUTOFF, EXPECTED_CANDIDATE_COUNT, PRESERVED_EMAILS, executePlan, hasStrongActivity, preflight, readAndVerifyManifest, scanReferences, scanReferencesBatch, sha256,
    validateManifest, type CandidateIdentity, type Manifest,
} from "./lib";
import { writeInventoryResult } from "./inventory";

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
    constructor(private rows: Row[], private mutations: string[], private name: string, private cursorOpens: Map<string, number>) {}
    async findOne(filter: Row) { return this.rows.find((row) => matches(row, filter)) ?? null; }
    find(filter: Row = {}) {
        this.cursorOpens.set(this.name, (this.cursorOpens.get(this.name) ?? 0) + 1);
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
    cursorOpens = new Map<string, number>();
    constructor(public data: Record<string, Row[]>) {}
    collection(name: string) { this.data[name] ??= []; return new FakeCollection(this.data[name], this.mutations, name, this.cursorOpens); }
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

test("batch scan finds multiple candidates, nested identities, exact case-insensitive email, and multi-candidate documents", async () => {
    const first = account(0); const second = account(1);
    const sharedId = new ObjectId();
    const db = new FakeDb({ notifications: [
        { _id: new ObjectId(), nested: { recipients: [{ identity: first.did }] } },
        { _id: new ObjectId(), email: second.email.toUpperCase() },
        { _id: new ObjectId(), email: `${first.email}.invalid` },
        { _id: sharedId, identities: [new ObjectId(first._id), second.did] },
    ] });
    const found = await scanReferencesBatch(db as any, [first, second]);
    assert.deepEqual(found.get(first._id)!.map((reference) => reference.paths), [["nested.recipients[0].identity"], ["identities[0]"]]);
    assert.deepEqual(found.get(second._id)!.map((reference) => reference.paths), [["email"], ["identities[1]"]]);
    assert.equal(found.get(first._id)!.some((reference) => reference.documentId.equals(sharedId)), true);
    assert.equal(found.get(second._id)!.some((reference) => reference.documentId.equals(sharedId)), true);
});

test("batch scanner is equivalent to single-account scans for representative identity semantics", async () => {
    const first = account(0); const second = account(1);
    const shared = new ObjectId();
    const data = { notifications: [
        { _id: new ObjectId(), nested: [{ owner: { did: first.did } }] },
        { _id: new ObjectId(), targetId: new ObjectId(second._id) },
        { _id: new ObjectId(), email: first.email.toUpperCase() },
        { _id: new ObjectId(), email: `${second.email}.not-exact` },
        { _id: shared, nested: { identities: [first._id, second.did] } },
    ] };
    const normalize = (references: Awaited<ReturnType<typeof scanReferences>>) => references.map((reference) => ({
        collection: reference.collection, documentId: String(reference.documentId), paths: reference.paths,
    }));
    const batch = await scanReferencesBatch(new FakeDb(data) as any, [first, second]);
    const firstSingle = await scanReferences(new FakeDb(data) as any, first);
    const secondSingle = await scanReferences(new FakeDb(data) as any, second);
    assert.deepEqual(normalize(batch.get(first._id)!), normalize(firstSingle));
    assert.deepEqual(normalize(batch.get(second._id)!), normalize(secondSingle));
    assert.equal(batch.get(first._id)!.some((reference) => reference.documentId.equals(shared)), true);
    assert.equal(batch.get(second._id)!.some((reference) => reference.documentId.equals(shared)), true);
});

test("batch scanner rejects empty and duplicate candidate identities before opening cursors", async () => {
    const cases: Array<[RegExp, (accounts: CandidateIdentity[]) => void]> = [
        [/non-empty candidate DID/, (accounts) => { accounts[0].did = " "; }],
        [/non-empty candidate email/, (accounts) => { accounts[0].email = ""; }],
        [/unique candidate _id/, (accounts) => { accounts[1]._id = accounts[0]._id; }],
        [/unique candidate DID/, (accounts) => { accounts[1].did = accounts[0].did; }],
        [/unique candidate email/, (accounts) => { accounts[1].email = accounts[0].email.toUpperCase(); }],
    ];
    for (const [message, mutate] of cases) {
        const accounts = [account(0), account(1)]; mutate(accounts);
        const db = new FakeDb({ notifications: [] });
        await assert.rejects(scanReferencesBatch(db as any, accounts), message);
        assert.deepEqual(Object.fromEntries(db.cursorOpens), {});
    }
});

test("inventory mismatch writes a redacted aggregate diagnostic and no manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "signup-bomb-diagnostic-"));
    const first = account(0); const second = account(1);
    const secret = "TOP SECRET welcome body for Person Name";
    const references = new Map([
        [first._id, [{ collection: "chatMessageDocs", documentId: new ObjectId(), paths: ["senderDid"], document: {
            _id: new ObjectId(), senderDid: first.did, source: "system-welcome", metadata: { source: "signup" },
            system: { systemType: "welcome" }, body: secret, name: "Person Name", email: first.email,
        } }]],
        [second._id, [{ collection: "chatConversations", documentId: new ObjectId(), paths: ["participants[0]"], document: {
            _id: new ObjectId(), type: "dm", handle: `welcome-${second.did}`, participants: [second.did],
        } }]],
    ] as Array<[string, any[]]>);
    await assert.rejects(writeInventoryResult({
        database: "circles", generatedAt: "2026-10-16T00:00:00.000Z", reviewedProfiles: 2,
        syntheticCandidates: [first, second], referencesByAccount: references, preservedAccountIds: manifest().preservedAccountIds,
        artifactDirectory: directory,
    }), /expected exactly 303 candidates/);
    const files = await readdir(directory);
    assert.equal(files.some((file) => file.startsWith("manifest-")), false);
    assert.equal(files.length, 1);
    const diagnosticPath = join(directory, files[0]);
    const serialized = await readFile(diagnosticPath, "utf8");
    const diagnostic = JSON.parse(serialized);
    assert.equal((await stat(diagnosticPath)).mode & 0o777, 0o600);
    assert.equal(diagnostic.syntheticCandidatesInspected, 2);
    assert.equal(diagnostic.excludedAsStrong, 2);
    assert.equal(diagnostic.collections.some((item: Row) => item.collection === "chatMessageDocs" && item.policyKind === "strong" && item.matchedPathSignature === "senderDid" && item.totalReferenceCount === 1), true);
    assert.equal(diagnostic.structuralFlags.handleStartsWithWelcome.some((item: Row) => item.value === true && item.count === 1), true);
    assert.equal(diagnostic.conversationSignatures.some((item: Row) => item.signature.includes('"participantShape":"candidate-only"') && item.signature.includes('"circleRelation":"absent"')), true);
    for (const forbidden of [first._id, first.email, first.did, second._id, second.email, second.did, first.name, second.name, secret, "Person Name"]) {
        assert.equal(serialized.includes(forbidden), false, `diagnostic leaked ${forbidden}`);
    }
});

test("exact-303 inventory success still writes the manifest and normal report only", async () => {
    const directory = await mkdtemp(join(tmpdir(), "signup-bomb-success-"));
    const value = manifest();
    await writeInventoryResult({
        database: "circles", generatedAt: "2026-10-16T00:00:00.000Z", reviewedProfiles: value.accounts.length,
        syntheticCandidates: value.accounts, referencesByAccount: new Map(value.accounts.map((item) => [item._id, []])),
        preservedAccountIds: value.preservedAccountIds, artifactDirectory: directory,
    });
    const files = await readdir(directory);
    assert.equal(files.filter((file) => file.startsWith("manifest-")).length, 1);
    assert.equal(files.filter((file) => file.startsWith("inventory-report-")).length, 1);
    assert.equal(files.some((file) => file.startsWith("inventory-diagnostic-")), false);
});

test("batch scan opens each collection cursor once and excludes preserved identities from candidate results", async () => {
    const value = manifest(); const preservedDid = "did:kamooni:preserved";
    const db = new FakeDb({
        notifications: [{ _id: new ObjectId(), userDid: value.accounts[0].did }, { _id: new ObjectId(), userDid: preservedDid }],
        tasks: [{ _id: new ObjectId(), watchers: [value.accounts[1]._id] }],
    });
    const found = await scanReferencesBatch(db as any, value.accounts);
    assert.equal(found.get(value.accounts[0]._id)!.length, 1);
    assert.equal([...found.values()].flat().some((reference) => reference.document.userDid === preservedDid), false);
    assert.deepEqual(Object.fromEntries(db.cursorOpens), { notifications: 1, tasks: 1 });
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

function welcomeConversation(value: Manifest, overrides: Row = {}): Row {
    const candidate = value.accounts[0];
    return { _id: new ObjectId(), type: "dm", handle: `welcome-${candidate.did}`, participants: [candidate.did], metadata: { source: "system_welcome", repliesDisabled: true }, ...overrides };
}

function welcomeMessage(value: Manifest, conversationId: ObjectId, overrides: Row = {}): Row {
    const candidate = value.accounts[0];
    return {
        _id: new ObjectId(), conversationId: String(conversationId), senderDid: "did:kamooni:system", source: "system_welcome",
        system: { messageType: "system", systemType: "welcome", source: "signup", targetDid: candidate.did, repliesDisabled: true },
        ...overrides,
    };
}

function announcementConversation(value: Manifest, legacy = false, overrides: Row = {}): Row {
    const candidate = value.accounts[0];
    return {
        _id: new ObjectId(), type: legacy ? "dm" : "announcement", handle: legacy ? "platform-announcements" : "kamooni-announcements",
        participants: [candidate.did], metadata: { source: "platform_admin", version: "v1", repliesDisabled: true },
        ...(legacy ? {} : { repliesDisabled: true }), ...overrides,
    };
}

function announcementMessage(value: Manifest, conversationId: ObjectId, overrides: Row = {}): Row {
    return {
        _id: new ObjectId(), conversationId: String(conversationId), senderDid: "system:platform_admin", source: "platform_admin",
        system: { messageType: "system", systemType: "announcement", source: "platform_admin", repliesDisabled: true },
        ...overrides,
    };
}

async function assertConversationIsStrong(conversation: Row, extra: Record<string, Row[]> = {}, value = manifest()) {
    const db = new FakeDb({ circles: profiles(value), chatConversations: [conversation], ...extra });
    await assert.rejects(preflight(db as any, value), /New meaningful activity|Ambiguous or substantive/);
    assert.deepEqual(db.mutations, []);
}

test("exact candidate-owned signup welcome DM and its message are deleted", async () => {
    const value = manifest(); const conversation = welcomeConversation(value);
    const db = new FakeDb({ circles: profiles(value), chatConversations: [conversation], chatMessageDocs: [welcomeMessage(value, conversation._id)] });
    const checked = await preflight(db as any, value);
    assert.equal(checked.plans[0].reconciliations.length, 0);
    await executePlan(db as any, checked.plans[0]);
    assert.equal(db.data.chatConversations.length, 0);
    assert.equal(db.data.chatMessageDocs.length, 0);
});

test("welcome-like conversations fail closed on missing markers, another participant, or candidate-authored content", async () => {
    const value = manifest();
    const missingMarker = welcomeConversation(value, { metadata: { repliesDisabled: true } });
    await assertConversationIsStrong(missingMarker);
    const shared = welcomeConversation(value, { participants: [value.accounts[0].did, "did:human"] });
    await assertConversationIsStrong(shared, { chatMessageDocs: [welcomeMessage(value, shared._id)] });
    const authored = welcomeConversation(value);
    await assertConversationIsStrong(authored, { chatMessageDocs: [welcomeMessage(value, authored._id, { senderDid: value.accounts[0].did })] });
});

test("exact current and reviewed legacy platform announcement conversations are deleted", async () => {
    for (const legacy of [false, true]) {
        const value = manifest(); const conversation = announcementConversation(value, legacy);
        const db = new FakeDb({ circles: profiles(value), chatConversations: [conversation], chatMessageDocs: [announcementMessage(value, conversation._id)] });
        const checked = await preflight(db as any, value);
        await executePlan(db as any, checked.plans[0]);
        assert.equal(db.data.chatConversations.length, 0);
        assert.equal(db.data.chatMessageDocs.length, 0);
    }
});

test("announcement cleanup cascades exact per-conversation state and preserves global broadcasts", async () => {
    const value = manifest(); const conversation = announcementConversation(value);
    const globalBroadcast = { _id: new ObjectId(), body: "Global definition", active: true };
    const db = new FakeDb({
        circles: profiles(value), chatConversations: [conversation],
        chatMessageDocs: [announcementMessage(value, conversation._id)],
        chatReadStates: [{ _id: new ObjectId(), conversationId: String(conversation._id), userDid: value.accounts[0].did }],
        chatTopicReadStates: [{ _id: new ObjectId(), conversationId: String(conversation._id), userDid: value.accounts[0].did, topicId: "topic" }],
        chatRoomMembers: [{ _id: new ObjectId(), chatRoomId: String(conversation._id), userDid: value.accounts[0].did }],
        platformBroadcastMessages: [globalBroadcast],
    });
    const checked = await preflight(db as any, value);
    await executePlan(db as any, checked.plans[0]);
    for (const collection of ["chatConversations", "chatMessageDocs", "chatReadStates", "chatTopicReadStates", "chatRoomMembers"]) assert.equal(db.data[collection].length, 0, collection);
    assert.deepEqual(db.data.platformBroadcastMessages, [globalBroadcast]);
});

test("announcement-shaped records with arbitrary type, another participant, or candidate authorship are strong", async () => {
    const value = manifest();
    await assertConversationIsStrong({ _id: new ObjectId(), type: "group", participants: [value.accounts[0].did], metadata: { source: "platform_admin" } });
    const shared = announcementConversation(value, false, { participants: [value.accounts[0].did, "did:human"] });
    await assertConversationIsStrong(shared);
    const authored = announcementConversation(value);
    await assertConversationIsStrong(authored, { chatMessageDocs: [announcementMessage(value, authored._id, { senderDid: value.accounts[0].did })] });
    const otherReader = announcementConversation(value);
    await assertConversationIsStrong(otherReader, { chatReadStates: [{ _id: new ObjectId(), conversationId: String(otherReader._id), userDid: "did:human" }] });
});

test("only an exact empty candidate-owned profile-circle conversation is deleted", async () => {
    const value = manifest();
    const conversation = { _id: new ObjectId(), type: "group", circleId: value.accounts[0]._id, participants: [] };
    const db = new FakeDb({ circles: profiles(value), chatConversations: [conversation] });
    const checked = await preflight(db as any, value);
    await executePlan(db as any, checked.plans[0]);
    assert.equal(db.data.chatConversations.length, 0);
    assert.equal(db.data.chatConversations.some((row) => row.circleId === value.accounts[0]._id), false);
});

test("profile-circle conversations with substantive shape or state fail closed", async () => {
    const value = manifest();
    const variants = [
        { participants: [value.accounts[0].did] }, { name: "Named" }, { handle: "custom" }, { metadata: { source: "custom" } },
    ];
    for (const overrides of variants) await assertConversationIsStrong({ _id: new ObjectId(), type: "group", circleId: value.accounts[0]._id, participants: [], ...overrides }, {}, value);
    const withMessage = { _id: new ObjectId(), type: "group", circleId: value.accounts[0]._id, participants: [] };
    await assertConversationIsStrong(withMessage, { chatMessageDocs: [{ _id: new ObjectId(), conversationId: String(withMessage._id), senderDid: "did:human", body: "substantive" }] }, value);
    const withMembership = { _id: new ObjectId(), type: "group", circleId: value.accounts[0]._id, participants: [] };
    await assertConversationIsStrong(withMembership, { chatRoomMembers: [{ _id: new ObjectId(), chatRoomId: String(withMembership._id), userDid: "did:human", status: "active" }] }, value);
    await assertConversationIsStrong({ _id: new ObjectId(), type: "group", circleId: new ObjectId().toHexString(), participants: [value.accounts[0].did] });
});

test("genuine user-created group and DM conversations remain strong", async () => {
    const value = manifest();
    await assertConversationIsStrong({ _id: new ObjectId(), type: "group", name: "Real group", participants: [value.accounts[0].did] });
    await assertConversationIsStrong({ _id: new ObjectId(), type: "dm", handle: "dm-real", participants: [value.accounts[0].did, "did:human"] });
});

test("automatic conversation cleanup is idempotent and leaves no single-user welcome or announcement orphan", async () => {
    const value = manifest(); const welcome = welcomeConversation(value); const announcement = announcementConversation(value);
    const db = new FakeDb({
        circles: profiles(value), chatConversations: [welcome, announcement],
        chatMessageDocs: [welcomeMessage(value, welcome._id), announcementMessage(value, announcement._id)],
    });
    const first = await preflight(db as any, value);
    await executePlan(db as any, first.plans[0]);
    const second = await preflight(db as any, value);
    assert.equal(await executePlan(db as any, second.plans[0]), "skipped");
    assert.equal(db.data.chatConversations.some((row) => ["welcome-", "kamooni-announcements", "platform-announcements"].some((handle) => String(row.handle ?? "").startsWith(handle))), false);
});

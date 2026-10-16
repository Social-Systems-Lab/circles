import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Db, Document, MongoClient, ObjectId } from "mongodb";

export const EXPECTED_DATABASE = "circles";
export const EXPECTED_CANDIDATE_COUNT = 303;
export const ATTACK_WINDOW_START = new Date("2026-09-09T00:00:00.000Z");
export const CUTOFF = new Date("2026-10-15T19:04:30.000Z");
export const ARTIFACT_DIRECTORY = resolve(process.cwd(), "artifacts/signup-bomb");

export const PRESERVED_EMAILS = [
    "paolaquirogaolivares@gmail.com",
    "ali75tabrizi@gmail.com",
    "kerriann.hoekstra@gmail.com",
    "kate@katearms.com",
    "errol.tanriverdi@gmail.com",
    "patrick.bannon@sac.se",
    "elegbeleyesamuel12@gmail.com",
] as const;

export const KNOWN_COLLECTIONS = [
    "adminRoleRemovalRequests", "aggregateRanks", "attachCircleRequests", "causes", "challenges",
    "chatConversations", "chatMessageDocs", "chatReadStates", "chatRoomMembers", "chatRooms",
    "chatTopicReadStates", "circles", "comments", "detachCircleRequests", "eventInvitations",
    "eventOccurrenceInvitations", "eventOccurrenceRsvps", "eventOccurrences", "eventRsvps", "events",
    "externalNotificationChannels", "feeds", "fundingAsks", "goalMembers", "goals", "humanityVerifications",
    "issues", "members", "membershipCredentialHandoffs", "membershipCredentialStatuses", "membershipRequests",
    "messageEmailReminders", "notifications", "platformBroadcastMessages", "platformSettings", "posts",
    "privateMedia", "proposals", "rankedLists", "reactions", "schemaMigrations", "serverSettings",
    "signupAltchaChallenges", "signupEmailReservations", "signupRateLimits", "skills", "systemBanners",
    "systemMessageTemplates", "tasks", "userNotificationSettings", "userRelationships", "verificationMessages",
    "verifications", "vibeIdSignInRequests",
] as const;

export type CandidateIdentity = {
    _id: string;
    did: string;
    email: string;
    handle: string;
    name: string;
    objectIdTimestamp: string;
    isEmailVerified: boolean | null;
    accountStatus: string | null;
    verificationStatus: string | null;
};

export type Manifest = {
    schemaVersion: 1;
    database: string;
    cutoff: string;
    generatedAt: string;
    candidateCount: number;
    preservedAccountIds: string[];
    accounts: CandidateIdentity[];
};

export type Reference = { collection: string; documentId: any; paths: string[]; document: Document };
export type AccountPlan = { account: CandidateIdentity; missing: boolean; deletions: Reference[]; reconciliations: Reference[]; assets: string[] };
export type Preflight = { plans: AccountPlan[]; missing: CandidateIdentity[]; externalAssets: string[]; policyNotes: string[] };

const SUBSTANTIVE_COLLECTIONS = new Set([
    "causes", "challenges", "comments", "eventOccurrences", "events", "feeds", "fundingAsks", "goals", "issues",
    "platformBroadcastMessages", "posts", "proposals", "rankedLists", "skills", "tasks",
]);
const ALWAYS_STRONG_COLLECTIONS = new Set([
    "aggregateRanks", "eventOccurrenceRsvps", "eventRsvps", "goalMembers", "membershipRequests", "reactions",
]);

const SAFE_OWNED_COLLECTIONS = new Set([
    "chatReadStates", "chatTopicReadStates", "notifications", "signupAltchaChallenges", "signupEmailReservations",
    "signupRateLimits",
]);

const ASSET_KEY = /(?:avatar|banner|file|image|media|picture|storage|url)/i;
const IDENTITY_FIELDS = ["did", "email", "handle", "name", "isEmailVerified", "accountStatus", "verificationStatus"] as const;

export function sha256(data: string | Buffer): string {
    return createHash("sha256").update(data).digest("hex");
}

export async function readAndVerifyManifest(path: string, expectedSha: string): Promise<{ manifest: Manifest; bytes: Buffer }> {
    const bytes = await readFile(path);
    const actual = sha256(bytes);
    if (!/^[a-f0-9]{64}$/i.test(expectedSha) || actual !== expectedSha.toLowerCase()) {
        throw new Error(`Manifest SHA-256 mismatch: expected ${expectedSha}, got ${actual}`);
    }
    const manifest = JSON.parse(bytes.toString("utf8")) as Manifest;
    validateManifest(manifest);
    return { manifest, bytes };
}

export function validateManifest(manifest: Manifest): void {
    if (manifest.schemaVersion !== 1) throw new Error("Unsupported manifest schemaVersion");
    if (manifest.database !== EXPECTED_DATABASE) throw new Error(`Manifest database must be ${EXPECTED_DATABASE}`);
    if (manifest.cutoff !== CUTOFF.toISOString()) throw new Error("Manifest cutoff does not match the reviewed cutoff");
    if (manifest.candidateCount !== EXPECTED_CANDIDATE_COUNT || manifest.accounts.length !== EXPECTED_CANDIDATE_COUNT) {
        throw new Error(`Manifest must contain exactly ${EXPECTED_CANDIDATE_COUNT} candidates`);
    }
    if (manifest.preservedAccountIds.length !== PRESERVED_EMAILS.length || new Set(manifest.preservedAccountIds).size !== PRESERVED_EMAILS.length) {
        throw new Error("Manifest must contain exactly seven unique preserved account IDs");
    }
    if (manifest.preservedAccountIds.some((id) => !ObjectId.isValid(id))) throw new Error("Every preserved account ID must be a valid ObjectId");
    const ids = new Set<string>();
    const dids = new Set<string>();
    for (const account of manifest.accounts) {
        if (!ObjectId.isValid(account._id) || !account.did || !account.email || !account.handle || !account.name) throw new Error("Every candidate needs complete identity fields");
        const timestamp = new ObjectId(account._id).getTimestamp();
        if (account.objectIdTimestamp !== timestamp.toISOString() || timestamp < ATTACK_WINDOW_START || timestamp > CUTOFF) throw new Error(`Candidate ${account._id} is outside the reviewed ObjectId window`);
        if (ids.has(account._id) || dids.has(account.did)) throw new Error("Candidate _id and DID values must be unique");
        if (manifest.preservedAccountIds.includes(account._id)) throw new Error(`Preserved account ${account._id} is in candidate set`);
        ids.add(account._id); dids.add(account.did);
    }
}

export function toCandidate(profile: Document): CandidateIdentity {
    if (!(profile._id instanceof ObjectId)) throw new Error("Candidate profile _id is not an ObjectId");
    return {
        _id: profile._id.toHexString(), did: String(profile.did ?? ""), email: String(profile.email ?? ""),
        handle: String(profile.handle ?? ""), name: String(profile.name ?? ""),
        objectIdTimestamp: profile._id.getTimestamp().toISOString(),
        isEmailVerified: typeof profile.isEmailVerified === "boolean" ? profile.isEmailVerified : null,
        accountStatus: typeof profile.accountStatus === "string" ? profile.accountStatus : null,
        verificationStatus: typeof profile.verificationStatus === "string" ? profile.verificationStatus : null,
    };
}

export function compareIdentity(profile: Document, account: CandidateIdentity): string[] {
    const current = toCandidate(profile);
    return IDENTITY_FIELDS.filter((key) => current[key] !== account[key]).map((key) => `${key}: manifest=${JSON.stringify(account[key])} current=${JSON.stringify(current[key])}`);
}

function scalarMatches(value: unknown, account: CandidateIdentity): boolean {
    if (value instanceof ObjectId) return value.toHexString() === account._id;
    if (typeof value !== "string") return false;
    return value === account._id || value === account.did || value.toLowerCase() === account.email.toLowerCase();
}

export function matchingPaths(value: unknown, account: CandidateIdentity, path = ""): string[] {
    if (scalarMatches(value, account)) return [path || "$"];
    if (Array.isArray(value)) return value.flatMap((item, index) => matchingPaths(item, account, `${path}[${index}]`));
    if (!value || typeof value !== "object" || value instanceof Date || value instanceof ObjectId) return [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => matchingPaths(child, account, path ? `${path}.${key}` : key));
}

export function collectAssetReferences(value: unknown, path = ""): string[] {
    if (Array.isArray(value)) return value.flatMap((v, i) => collectAssetReferences(v, `${path}[${i}]`));
    if (!value || typeof value !== "object" || value instanceof Date || value instanceof ObjectId) return [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
        const childPath = path ? `${path}.${key}` : key;
        const own = ASSET_KEY.test(key) && typeof child === "string" && /(?:https?:\/\/|\/storage\/|minio|qdrant)/i.test(child)
            ? [`${childPath}=${child}`] : [];
        return own.concat(collectAssetReferences(child, childPath));
    });
}

export async function scanReferences(db: Db, account: CandidateIdentity): Promise<Reference[]> {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    const references: Reference[] = [];
    for (const name of KNOWN_COLLECTIONS) {
        if (!existing.has(name)) continue;
        for await (const document of db.collection(name).find({})) {
            if (name === "circles" && document._id instanceof ObjectId && document._id.toHexString() === account._id && document.did === account.did) continue;
            const paths = matchingPaths(document, account);
            if (paths.length) references.push({ collection: name, documentId: document._id, paths, document });
        }
    }
    return references;
}

export function isStrongActivityReference(reference: Reference): boolean {
    return referencePolicy(reference).kind === "strong";
}

export async function hasStrongActivity(db: Db, account: CandidateIdentity): Promise<{ active: boolean; reasons: string[]; observations: string[]; uncertain: string[] }> {
    const references = await scanReferences(db, account);
    const reasons = references.filter(isStrongActivityReference).map((r) => `${r.collection}:${String(r.documentId)}:${r.paths.join(",")}`);
    const observations = references
        .filter((reference) => reference.collection === "humanityVerifications" && referencePolicy(reference).kind === "delete")
        .map((reference) => `${reference.collection}:${String(reference.documentId)}:${referencePolicy(reference).reason}`);
    const uncertain = references.filter((reference) => referencePolicy(reference).kind === "abort")
        .map((reference) => `${reference.collection}:${String(reference.documentId)}:${referencePolicy(reference).reason}`);
    return { active: reasons.length > 0, reasons, observations, uncertain };
}

type ReferencePolicy = { kind: "strong" | "delete" | "reconcile" | "abort"; reason: string };

function hasPath(reference: Reference, fields: RegExp): boolean {
    return reference.paths.some((path) => fields.test(path));
}

function pathsOnly(reference: Reference, fields: RegExp): boolean {
    return reference.paths.length > 0 && reference.paths.every((path) => fields.test(path));
}

function isAutomaticChatArtifact(document: Document): boolean {
    const source = String(document.source ?? document.type ?? document.kind ?? "").toLowerCase();
    const metadataType = String(document.metadata?.type ?? document.system?.type ?? "").toLowerCase();
    return document.isSystem === true || document.automatic === true || document.system === true ||
        /(?:system|automatic|welcome|onboarding)/.test(source) || /(?:system|automatic|welcome|onboarding)/.test(metadataType);
}

export function referencePolicy(reference: Reference): ReferencePolicy {
    const { collection, document } = reference;
    if (SUBSTANTIVE_COLLECTIONS.has(collection) || ALWAYS_STRONG_COLLECTIONS.has(collection)) {
        return { kind: "strong", reason: "authored or participatory platform record" };
    }
    if (collection === "members") {
        if (hasPath(reference, /^(?:circleId)$/) && !hasPath(reference, /^(?:userDid)$/)) return { kind: "strong", reason: "inbound follower/member of candidate profile" };
        if (pathsOnly(reference, /^(?:userDid|circleId)$/) && hasPath(reference, /^userDid$/) && hasPath(reference, /^circleId$/)) return { kind: "delete", reason: "own-profile self-membership" };
        return { kind: "strong", reason: "external membership" };
    }
    if (collection === "userRelationships") {
        const realEdge = document.isFollowing === true || ![undefined, null, "none"].includes(document.connectStatus) ||
            document.dmPermission === "allowed" || ![undefined, null, "none"].includes(document.dmPermissionSource);
        return realEdge
            ? { kind: "strong", reason: "follow/contact/DM relationship edge" }
            : { kind: "delete", reason: "inert relationship edge with no relationship state" };
    }
    if (collection === "eventInvitations" || collection === "eventOccurrenceInvitations") {
        if (hasPath(reference, /(?:^|\.)(?:invitedBy|inviterDid|createdBy|senderDid)$/i)) return { kind: "strong", reason: "outgoing event invitation" };
        if (collection === "eventInvitations" && document.status !== undefined && document.status !== "pending") return { kind: "strong", reason: "candidate acted on an incoming event invitation" };
        if (pathsOnly(reference, /(?:^|\.)(?:userDid|inviteeDid|recipientDid|email)$/i)) return { kind: "delete", reason: "incoming event invitation only" };
        return { kind: "abort", reason: "uncertain event-invitation role" };
    }
    if (collection === "humanityVerifications") {
        if (hasPath(reference, /(?:^|\.)verifierDid$/i)) return { kind: "strong", reason: "candidate acted as humanity verifier" };
        if (pathsOnly(reference, /(?:^|\.)subjectDid$/i)) return { kind: "delete", reason: "candidate is only the verification subject; conservatively reported as received evidence, not user activity" };
        return { kind: "abort", reason: "uncertain humanity-verification role" };
    }
    if (collection === "verificationMessages") {
        return hasPath(reference, /(?:^|\.)senderDid$/i)
            ? { kind: "strong", reason: "verification message authored by candidate" }
            : { kind: "abort", reason: "uncertain verification-message reference" };
    }
    if (collection === "privateMedia") {
        return hasPath(reference, /(?:^|\.)uploadedByDid$/i)
            ? { kind: "strong", reason: "private media uploaded by candidate" }
            : { kind: "abort", reason: "uncertain private-media reference" };
    }
    if (collection === "externalNotificationChannels") return { kind: "strong", reason: "external notification channel connection" };
    if (collection === "verifications") return { kind: "strong", reason: "verification request or review activity" };
    if (collection === "circles") return { kind: "strong", reason: "created or modified another circle/project" };
    if (["adminRoleRemovalRequests", "attachCircleRequests", "detachCircleRequests"].includes(collection)) {
        if (hasPath(reference, /(?:^|\.)(?:requestedByDid|approvedByDid|approvedByDids\[\d+\])$/i)) {
            return { kind: "strong", reason: "governance/admin request initiated or approved by candidate" };
        }
        return { kind: "abort", reason: "candidate is the target or has an uncertain governance/admin role" };
    }
    if (collection === "chatRoomMembers") {
        if (pathsOnly(reference, /^(?:userDid|circleId)$/) && hasPath(reference, /^userDid$/) && hasPath(reference, /^circleId$/)) return { kind: "delete", reason: "automatic own-profile chat membership" };
        if (isAutomaticChatArtifact(document) && pathsOnly(reference, /(?:^|\.)(?:userDid|memberDid|recipientDid)$/i)) return { kind: "delete", reason: "explicitly marked automatic/system chat membership" };
        return { kind: "strong", reason: "non-automatic chat room membership" };
    }
    if (collection === "chatMessageDocs") {
        if (hasPath(reference, /(?:^|\.)(?:senderDid|createdBy|authorDid|author|reactions\[\d+\]\.(?:userDid|sender))$/i)) return { kind: "strong", reason: "authored chat message/topic/reply or reaction" };
        if (isAutomaticChatArtifact(document)) return { kind: "delete", reason: "automatic welcome/system chat artifact" };
        return { kind: "abort", reason: "uncertain non-system chat reference" };
    }
    if (collection === "chatConversations" || collection === "chatRooms") {
        if (isAutomaticChatArtifact(document) && pathsOnly(reference, /(?:^|\.)(?:participants|dmParticipants)\[\d+\]$/i)) return { kind: "reconcile", reason: "participant of explicitly marked automatic/system chat" };
        return { kind: "strong", reason: "substantive or uncertain chat participation" };
    }
    if (collection === "messageEmailReminders") {
        if (hasPath(reference, /(?:^|\.)senderDid$/i)) return { kind: "strong", reason: "message sender" };
        if (pathsOnly(reference, /(?:^|\.)(?:recipientDid|email)$/i)) return { kind: "delete", reason: "automatic reminder received by candidate" };
        return { kind: "abort", reason: "uncertain message reminder role" };
    }
    if (SAFE_OWNED_COLLECTIONS.has(collection)) {
        const ownedPath = /(?:^|\.)(?:userDid|userId|ownerDid|ownerId|recipientDid|recipientId|memberDid|authenticatedUserDid|inviteeDid|targetDid|email)(?:$|\[|\.)/i;
        return pathsOnly(reference, ownedPath)
            ? { kind: "delete", reason: collection === "notifications" ? "received notification" : "automatic account-owned artifact" }
            : { kind: "abort", reason: "candidate appears in an actor or unknown field" };
    }
    return { kind: "abort", reason: "unreviewed reference semantics (fail closed)" };
}

export function classifyReference(reference: Reference): "delete" | "reconcile" | "abort" {
    const kind = referencePolicy(reference).kind;
    return kind === "strong" ? "abort" : kind;
}

export async function preflight(db: Db, manifest: Manifest): Promise<Preflight> {
    validateManifest(manifest);
    for (let index = 0; index < PRESERVED_EMAILS.length; index++) {
        const protectedProfile = await db.collection("circles").findOne({
            _id: new ObjectId(manifest.preservedAccountIds[index]), circleType: "user",
        });
        if (!protectedProfile || String(protectedProfile.email ?? "").toLowerCase() !== PRESERVED_EMAILS[index]) {
            throw new Error(`Preserved identity mismatch: ${PRESERVED_EMAILS[index]}/${manifest.preservedAccountIds[index]}`);
        }
    }
    const plans: AccountPlan[] = [];
    const externalAssets = new Set<string>();
    const policyNotes = new Set<string>();
    for (const account of manifest.accounts) {
        const profile = await db.collection("circles").findOne({ _id: new ObjectId(account._id), did: account.did });
        if (!profile) {
            const byEither = await db.collection("circles").findOne({ $or: [{ _id: new ObjectId(account._id) }, { did: account.did }] });
            if (byEither) throw new Error(`Identity pair drift for candidate ${account._id}/${account.did}`);
            const references = await scanReferences(db, account);
            const aborts = references.filter((r) => classifyReference(r) === "abort");
            if (aborts.length) throw new Error(`Ambiguous or substantive reference for missing candidate ${account._id}: ${aborts.map((r) => `${r.collection}:${String(r.documentId)}:${referencePolicy(r).reason}`).join(", ")}`);
            const assets = references.flatMap((r) => collectAssetReferences(r.document));
            references.filter((r) => r.collection === "humanityVerifications" && referencePolicy(r).kind === "delete")
                .forEach((r) => policyNotes.add(`${account._id}:${r.collection}:${String(r.documentId)}:${referencePolicy(r).reason}`));
            assets.forEach((asset) => externalAssets.add(`${account._id}:${asset}`));
            plans.push({ account, missing: true, deletions: references.filter((r) => classifyReference(r) === "delete"), reconciliations: references.filter((r) => classifyReference(r) === "reconcile"), assets });
            continue;
        }
        const drift = compareIdentity(profile, account);
        if (drift.length) throw new Error(`Candidate drift for ${account._id}: ${drift.join("; ")}`);
        const references = await scanReferences(db, account);
        const strong = references.filter(isStrongActivityReference);
        if (strong.length) throw new Error(`New meaningful activity for ${account._id}: ${strong.map((r) => `${r.collection}:${String(r.documentId)}:${referencePolicy(r).reason}`).join(", ")}`);
        const aborts = references.filter((r) => classifyReference(r) === "abort");
        if (aborts.length) throw new Error(`Ambiguous or substantive reference for ${account._id}: ${aborts.map((r) => `${r.collection}:${String(r.documentId)}:${r.paths.join(",")}`).join("; ")}`);
        const assets = collectAssetReferences(profile).concat(references.flatMap((r) => collectAssetReferences(r.document)));
        references.filter((r) => r.collection === "humanityVerifications" && referencePolicy(r).kind === "delete")
            .forEach((r) => policyNotes.add(`${account._id}:${r.collection}:${String(r.documentId)}:${referencePolicy(r).reason}`));
        assets.forEach((asset) => externalAssets.add(`${account._id}:${asset}`));
        plans.push({ account, missing: false, deletions: references.filter((r) => classifyReference(r) === "delete"), reconciliations: references.filter((r) => classifyReference(r) === "reconcile"), assets });
    }
    return { plans, missing: plans.filter((p) => p.missing).map((p) => p.account), externalAssets: [...externalAssets].sort(), policyNotes: [...policyNotes].sort() };
}

export async function executePlan(db: Db, plan: AccountPlan): Promise<"deleted" | "skipped"> {
    for (const reference of plan.deletions) await db.collection(reference.collection).deleteOne({ _id: reference.documentId });
    for (const reference of plan.reconciliations) {
        const current = await db.collection(reference.collection).findOne({ _id: reference.documentId });
        if (!current) continue;
        const replacement = { ...current };
        let changed = false;
        for (const field of ["participants", "dmParticipants"] as const) {
            if (!Array.isArray(current[field])) continue;
            const filtered = current[field].filter((value: unknown) => !scalarMatches(value, plan.account));
            if (filtered.length !== current[field].length) { replacement[field] = filtered; changed = true; }
        }
        if (!changed) continue;
        if (Array.isArray(replacement.participants) && "participantCount" in replacement) replacement.participantCount = replacement.participants.length;
        await db.collection(reference.collection).replaceOne({ _id: current._id }, replacement);
    }
    if (plan.missing) return "skipped";
    const result = await db.collection("circles").deleteOne({ _id: new ObjectId(plan.account._id), did: plan.account.did });
    if (result.deletedCount !== 1) throw new Error(`Profile disappeared during cleanup: ${plan.account._id}`);
    return "deleted";
}

export async function writePrivateJson(path: string, value: unknown): Promise<{ path: string; sha256: string }> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    await chmod(path, 0o600);
    return { path, sha256: sha256(bytes) };
}

export function getOption(args: string[], name: string): string {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Required option ${name} is missing`);
    return args[index + 1];
}

export function assertDatabaseSafety(client: MongoClient, allowLocal: boolean): Db {
    const db = client.db();
    if (db.databaseName === EXPECTED_DATABASE) return db;
    const uri = process.env.MONGODB_URI ?? "";
    if (!allowLocal || !/(?:localhost|127\.0\.0\.1|\[::1\])/.test(uri)) {
        throw new Error(`Refusing database ${db.databaseName}; use --allow-non-circles-local-tests only with localhost fixtures`);
    }
    return db;
}

export function mongoUri(): string {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    return uri;
}

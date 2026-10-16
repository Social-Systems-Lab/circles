import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";
import {
    ARTIFACT_DIRECTORY, ATTACK_WINDOW_START, CUTOFF, EXPECTED_CANDIDATE_COUNT, PRESERVED_EMAILS,
    assertDatabaseSafety, buildInventoryDiagnostic, mongoUri, scanReferencesBatch, summarizeActivity, toCandidate, validateManifest,
    writePrivateJson, type CandidateIdentity, type Manifest, type Reference,
} from "./lib";

function hasReviewedSyntheticSignature(profile: Record<string, unknown>): boolean {
    if (!/^[a-z]{14,20}$/.test(String(profile.handle ?? ""))) return false;
    const parts = String(profile.name ?? "").trim().split(/\s+/);
    return parts.length >= 2 && parts.every((part) => part.length >= 8 && /[a-z]/.test(part) && /[A-Z]/.test(part));
}

type InventoryResultInput = {
    database: string;
    generatedAt: string;
    reviewedProfiles: number;
    syntheticCandidates: CandidateIdentity[];
    referencesByAccount: Map<string, Reference[]>;
    preservedAccountIds: string[];
    artifactDirectory?: string;
};

export async function writeInventoryResult(input: InventoryResultInput): Promise<void> {
    const accounts = [];
    const excludedForActivity: unknown[] = [];
    const reportedNonActivityEvidence: unknown[] = [];
    let hasUncertain = false;
    for (const candidate of input.syntheticCandidates) {
        const activity = summarizeActivity(input.referencesByAccount.get(candidate._id) ?? []);
        if (activity.uncertain.length) hasUncertain = true;
        if (activity.observations.length) reportedNonActivityEvidence.push({ _id: candidate._id, did: candidate.did, observations: activity.observations });
        if (activity.active) excludedForActivity.push({ _id: candidate._id, did: candidate.did, reasons: activity.reasons });
        if (!activity.active && !activity.uncertain.length) accounts.push(candidate);
    }
    const manifest: Manifest = {
        schemaVersion: 1, database: input.database, cutoff: CUTOFF.toISOString(), generatedAt: input.generatedAt,
        candidateCount: accounts.length, preservedAccountIds: input.preservedAccountIds, accounts,
    };
    const stamp = input.generatedAt.replace(/[:.]/g, "-");
    const artifactDirectory = input.artifactDirectory ?? ARTIFACT_DIRECTORY;
    if (accounts.length !== EXPECTED_CANDIDATE_COUNT) {
        const diagnosticResult = await writePrivateJson(resolve(artifactDirectory, `inventory-diagnostic-${stamp}.json`), {
            schemaVersion: 1,
            database: input.database,
            generatedAt: input.generatedAt,
            attackWindowStart: ATTACK_WINDOW_START.toISOString(),
            cutoff: CUTOFF.toISOString(),
            reviewedProfiles: input.reviewedProfiles,
            ...buildInventoryDiagnostic(input.syntheticCandidates, input.referencesByAccount),
        });
        throw new Error(`Safety stop: expected exactly ${EXPECTED_CANDIDATE_COUNT} candidates, found ${accounts.length}; private diagnostic: ${diagnosticResult.path}`);
    }
    if (hasUncertain) throw new Error("Safety stop: uncertain reference semantics in synthetic candidate set");
    validateManifest(manifest);
    const manifestResult = await writePrivateJson(resolve(artifactDirectory, `manifest-${stamp}.json`), manifest);
    const reportResult = await writePrivateJson(resolve(artifactDirectory, `inventory-report-${stamp}.json`), {
        schemaVersion: 1, database: input.database, generatedAt: input.generatedAt, attackWindowStart: ATTACK_WINDOW_START.toISOString(),
        cutoff: CUTOFF.toISOString(), reviewedProfiles: input.reviewedProfiles, syntheticSignatureMatches: input.syntheticCandidates.length,
        excludedForStrongActivity: excludedForActivity, candidateCount: accounts.length, manifestPath: manifestResult.path,
        reportedNonActivityEvidence, manifestSha256: manifestResult.sha256,
    });
    console.log(`Manifest: ${manifestResult.path}\nManifest SHA-256: ${manifestResult.sha256}\nReport: ${reportResult.path}\nReport SHA-256: ${reportResult.sha256}`);
}

async function main() {
    const args = process.argv.slice(2);
    const client = new MongoClient(mongoUri());
    try {
        await client.connect();
        const db = assertDatabaseSafety(client, args.includes("--allow-non-circles-local-tests"));
        const circles = db.collection("circles");
        const preserved = [];
        for (const email of PRESERVED_EMAILS) {
            const matches = await circles.find({ circleType: "user", email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).toArray();
            if (matches.length !== 1 || !(matches[0]._id instanceof ObjectId)) throw new Error(`Expected exactly one preserved profile for ${email}`);
            preserved.push(matches[0]._id.toHexString());
        }

        const raw = await circles.find({
            circleType: "user",
            _id: { $gte: ObjectId.createFromTime(Math.floor(ATTACK_WINDOW_START.getTime() / 1000)), $lt: ObjectId.createFromTime(Math.floor(CUTOFF.getTime() / 1000) + 1) },
        }).toArray();
        const synthetic = raw.filter(hasReviewedSyntheticSignature).filter((profile) => profile._id.getTimestamp() <= CUTOFF);
        const syntheticCandidates = synthetic.map(toCandidate);
        const referencesByAccount = await scanReferencesBatch(db, syntheticCandidates);
        await writeInventoryResult({
            database: db.databaseName, generatedAt: new Date().toISOString(), reviewedProfiles: raw.length,
            syntheticCandidates, referencesByAccount, preservedAccountIds: preserved,
        });
    } finally { await client.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => { console.error(error); process.exitCode = 1; });
}

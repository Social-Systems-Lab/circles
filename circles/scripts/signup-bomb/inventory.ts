import { resolve } from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import {
    ARTIFACT_DIRECTORY, ATTACK_WINDOW_START, CUTOFF, EXPECTED_CANDIDATE_COUNT, PRESERVED_EMAILS,
    assertDatabaseSafety, mongoUri, scanReferencesBatch, summarizeActivity, toCandidate, validateManifest,
    writePrivateJson, type Manifest,
} from "./lib";

function hasReviewedSyntheticSignature(profile: Record<string, unknown>): boolean {
    if (!/^[a-z]{14,20}$/.test(String(profile.handle ?? ""))) return false;
    const parts = String(profile.name ?? "").trim().split(/\s+/);
    return parts.length >= 2 && parts.every((part) => part.length >= 8 && /[a-z]/.test(part) && /[A-Z]/.test(part));
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
        const accounts = [];
        const excludedForActivity: unknown[] = [];
        const reportedNonActivityEvidence: unknown[] = [];
        for (const candidate of syntheticCandidates) {
            const activity = summarizeActivity(referencesByAccount.get(candidate._id)!);
            if (activity.uncertain.length) throw new Error(`Safety stop: uncertain reference semantics for ${candidate._id}: ${activity.uncertain.join("; ")}`);
            if (activity.observations.length) reportedNonActivityEvidence.push({ _id: candidate._id, did: candidate.did, observations: activity.observations });
            if (activity.active) excludedForActivity.push({ _id: candidate._id, did: candidate.did, reasons: activity.reasons });
            else accounts.push(candidate);
        }
        const manifest: Manifest = {
            schemaVersion: 1, database: db.databaseName, cutoff: CUTOFF.toISOString(), generatedAt: new Date().toISOString(),
            candidateCount: accounts.length, preservedAccountIds: preserved, accounts,
        };
        if (accounts.length !== EXPECTED_CANDIDATE_COUNT) throw new Error(`Safety stop: expected exactly ${EXPECTED_CANDIDATE_COUNT} candidates, found ${accounts.length}`);
        validateManifest(manifest);
        const stamp = manifest.generatedAt.replace(/[:.]/g, "-");
        const manifestResult = await writePrivateJson(resolve(ARTIFACT_DIRECTORY, `manifest-${stamp}.json`), manifest);
        const reportResult = await writePrivateJson(resolve(ARTIFACT_DIRECTORY, `inventory-report-${stamp}.json`), {
            schemaVersion: 1, database: db.databaseName, generatedAt: manifest.generatedAt, attackWindowStart: ATTACK_WINDOW_START.toISOString(),
            cutoff: CUTOFF.toISOString(), reviewedProfiles: raw.length, syntheticSignatureMatches: synthetic.length,
            excludedForStrongActivity: excludedForActivity, candidateCount: accounts.length, manifestPath: manifestResult.path,
            reportedNonActivityEvidence,
            manifestSha256: manifestResult.sha256,
        });
        console.log(`Manifest: ${manifestResult.path}\nManifest SHA-256: ${manifestResult.sha256}\nReport: ${reportResult.path}\nReport SHA-256: ${reportResult.sha256}`);
    } finally { await client.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

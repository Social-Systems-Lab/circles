import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import {
    ARTIFACT_DIRECTORY, EXPECTED_CANDIDATE_COUNT, PRESERVED_EMAILS, assertDatabaseSafety, getOption,
    mongoUri, readAndVerifyManifest, scanReferencesBatch, writePrivateJson,
} from "./lib";

type MutationReport = {
    mode: string; manifestSha256: string; deletedCount: number; skippedCount: number;
    deletedAccountIds: string[]; skippedAccountIds: string[]; pendingExternalAssets?: string[];
};

async function main() {
    const args = process.argv.slice(2);
    const manifestPath = getOption(args, "--manifest");
    const expectedSha = getOption(args, "--manifest-sha256").toLowerCase();
    const mutationPath = getOption(args, "--mutation-report");
    const { manifest } = await readAndVerifyManifest(manifestPath, expectedSha);
    const mutation = JSON.parse(await readFile(mutationPath, "utf8")) as MutationReport;
    if (mutation.mode !== "execute" || mutation.manifestSha256.toLowerCase() !== expectedSha) throw new Error("Mutation report does not belong to this manifest execution");
    if (mutation.deletedCount !== mutation.deletedAccountIds.length || mutation.skippedCount !== mutation.skippedAccountIds.length) throw new Error("Mutation report counts do not match its account lists");
    const outcomes = [...mutation.deletedAccountIds, ...mutation.skippedAccountIds];
    if (new Set(outcomes).size !== outcomes.length || outcomes.length !== EXPECTED_CANDIDATE_COUNT) throw new Error("Mutation report must account for each candidate exactly once");
    if (outcomes.some((id) => !manifest.accounts.some((account) => account._id === id))) throw new Error("Mutation report contains an account outside the manifest");

    const client = new MongoClient(mongoUri());
    try {
        await client.connect();
        const db = assertDatabaseSafety(client, args.includes("--allow-non-circles-local-tests"));
        const failures: string[] = [];
        const referencesByAccount = await scanReferencesBatch(db, manifest.accounts);
        for (const account of manifest.accounts) {
            const profile = await db.collection("circles").findOne({ $or: [{ _id: new ObjectId(account._id) }, { did: account.did }] });
            if (profile) failures.push(`profile identity remains: ${account._id}/${account.did}`);
            const references = referencesByAccount.get(account._id)!;
            if (references.length) failures.push(`references remain for ${account._id}: ${references.map((r) => `${r.collection}:${String(r.documentId)}`).join(",")}`);
        }
        for (let index = 0; index < PRESERVED_EMAILS.length; index++) {
            const expectedId = manifest.preservedAccountIds[index];
            const profile = await db.collection("circles").findOne({ _id: new ObjectId(expectedId), circleType: "user" });
            if (!profile || String(profile.email ?? "").toLowerCase() !== PRESERVED_EMAILS[index]) failures.push(`preserved identity mismatch: ${PRESERVED_EMAILS[index]}/${expectedId}`);
        }
        const pending = mutation.pendingExternalAssets ?? [];
        const verifiedAllRemoved = mutation.deletedCount === EXPECTED_CANDIDATE_COUNT && mutation.skippedCount === 0 && failures.length === 0;
        const result = await writePrivateJson(resolve(ARTIFACT_DIRECTORY, `verification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), {
            schemaVersion: 1, generatedAt: new Date().toISOString(), manifestPath, manifestSha256: expectedSha, mutationReportPath: mutationPath,
            deletedCount: mutation.deletedCount, skippedCount: mutation.skippedCount, failures, pendingExternalAssets: pending,
            all303RemovedByThisRun: verifiedAllRemoved, mongoVerificationPassed: failures.length === 0,
            complete: verifiedAllRemoved && pending.length === 0,
        });
        console.log(`Verification ${failures.length ? "FAILED" : "passed"}. Deleted by this run: ${mutation.deletedCount}; skipped as already missing: ${mutation.skippedCount}.\nExternal cleanup pending: ${pending.length}.\nAll 303 removed by this run: ${verifiedAllRemoved ? "yes" : "no"}.\nReport: ${result.path}`);
        if (failures.length) { failures.forEach((failure) => console.error(failure)); process.exitCode = 1; }
    } finally { await client.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

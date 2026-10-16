import { open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import {
    ARTIFACT_DIRECTORY, assertDatabaseSafety, executePlan, getOption, mongoUri, preflight, readAndVerifyManifest,
    sha256, writePrivateJson,
} from "./lib";

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes("--execute");
    const manifestPath = getOption(args, "--manifest");
    const expectedSha = getOption(args, "--manifest-sha256");
    const receiptPath = getOption(args, "--backup-receipt");
    const receipt = await readFile(receiptPath);
    if (!receipt.length) throw new Error("Backup receipt is empty");
    const { manifest } = await readAndVerifyManifest(manifestPath, expectedSha);
    const client = new MongoClient(mongoUri());
    try {
        await client.connect();
        const db = assertDatabaseSafety(client, args.includes("--allow-non-circles-local-tests"));
        console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}. Running full preflight for all ${manifest.accounts.length} candidates...`);
        const checked = await preflight(db, manifest);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        if (!execute) {
            const result = await writePrivateJson(resolve(ARTIFACT_DIRECTORY, `cleanup-dry-run-${stamp}.json`), {
                schemaVersion: 1, mode: "dry-run", generatedAt: new Date().toISOString(), manifestPath, manifestSha256: expectedSha,
                backupReceiptPath: receiptPath, backupReceiptSha256: sha256(receipt), preflightCount: checked.plans.length,
                wouldDelete: checked.plans.filter((p) => !p.missing).length, wouldSkipMissing: checked.missing.length,
                pendingExternalAssets: checked.externalAssets, policyNotes: checked.policyNotes,
            });
            console.log(`Dry run complete; MongoDB was not mutated. Report: ${result.path}\nReport SHA-256: ${result.sha256}`);
            return;
        }
        console.warn("\n*** WRITE FREEZE REQUIRED: this script cannot stop or verify circles, cron, or watchtower. ***\n");
        const ledgerPath = resolve(ARTIFACT_DIRECTORY, `cleanup-ledger-${stamp}.jsonl`);
        const ledger = await open(ledgerPath, "wx", 0o600);
        const deleted: string[] = []; const skipped: string[] = [];
        try {
            await ledger.write(`${JSON.stringify({ event: "started", at: new Date().toISOString(), manifestSha256: expectedSha })}\n`);
            await ledger.sync();
            for (const plan of checked.plans) {
                const outcome = await executePlan(db, plan);
                (outcome === "deleted" ? deleted : skipped).push(plan.account._id);
                await ledger.write(`${JSON.stringify({ event: outcome, at: new Date().toISOString(), _id: plan.account._id, did: plan.account.did })}\n`);
                await ledger.sync();
            }
            await ledger.write(`${JSON.stringify({ event: "finished", at: new Date().toISOString(), deletedCount: deleted.length, skippedCount: skipped.length })}\n`);
            await ledger.sync();
        } finally { await ledger.close(); }
        const result = await writePrivateJson(resolve(ARTIFACT_DIRECTORY, `cleanup-mutation-${stamp}.json`), {
            schemaVersion: 1, mode: "execute", generatedAt: new Date().toISOString(), manifestPath,
            manifestSha256: expectedSha, backupReceiptPath: receiptPath, backupReceiptSha256: sha256(receipt), ledgerPath,
            deletedCount: deleted.length, skippedCount: skipped.length, deletedAccountIds: deleted, skippedAccountIds: skipped,
            pendingExternalAssets: checked.externalAssets, complete: deleted.length === manifest.candidateCount && checked.externalAssets.length === 0,
            policyNotes: checked.policyNotes,
        });
        console.log(`Mongo cleanup finished: ${deleted.length} deleted, ${skipped.length} already missing.\nExternal cleanup pending: ${checked.externalAssets.length}.\nMutation report: ${result.path}\nReport SHA-256: ${result.sha256}`);
    } finally { await client.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

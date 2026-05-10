/**
 * Migration: account lifecycle fields
 *
 * Sets accountStatus on all existing user circles that don't yet have it:
 *   - isMember === true  → "active"
 *   - verificationStatus === "verified"  → "active"
 *   - otherwise  → "pending_verification"
 *
 * Run dry-run first:   bun scripts/migrate-account-lifecycle.ts
 * Apply:               bun scripts/migrate-account-lifecycle.ts --apply
 */

import { MongoClient } from "mongodb";

const MONGODB_URI =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGO_ROOT_USERNAME || "admin"}:${process.env.MONGO_ROOT_PASSWORD || "password"}@${process.env.MONGO_HOST || "127.0.0.1"}:${process.env.MONGO_PORT || "27017"}`;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

async function main() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db("circles");
    const circles = db.collection("circles");

    const users = await circles
        .find({ circleType: "user", accountStatus: { $exists: false } })
        .project({ _id: 1, isMember: 1, verificationStatus: 1, isVerified: 1 })
        .toArray();

    console.log(`Found ${users.length} users without accountStatus`);

    const counts = { active: 0, pending_verification: 0 };

    for (const user of users) {
        const isActive = user.isMember === true || user.verificationStatus === "verified" || user.isVerified === true;
        const newStatus = isActive ? "active" : "pending_verification";
        counts[newStatus]++;

        if (apply) {
            await circles.updateOne({ _id: user._id }, { $set: { accountStatus: newStatus } });
        } else {
            console.log(`  [dry-run] ${user._id} → ${newStatus}`);
        }
    }

    console.log(`\nSummary (${apply ? "applied" : "dry-run"}):`);
    console.log(`  active:               ${counts.active}`);
    console.log(`  pending_verification: ${counts.pending_verification}`);

    await client.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

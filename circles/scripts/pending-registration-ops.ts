import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";
import {
    ensureRegistrationRoutingRecord,
    getRegistrationRouting,
    setRegistrationMode,
    type RegistrationMode,
} from "@/lib/auth/registration-routing";
import crypto from "crypto";
import fs from "fs";
import { MongoClient, type Db } from "mongodb";

const command = process.argv[2];
const args = new Map<string, string>();
for (let index = 3; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "end"}`);
    args.set(key.slice(2), value);
}

const allowedTransitions = new Set(["legacy:paused", "paused:pending", "pending:paused", "paused:legacy"]);

function authenticateRoutingOperator() {
    const expectedHex = process.env.REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256 || "";
    if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
        throw new Error("Routing operator authorization verifier is not configured");
    }
    const input = fs.readFileSync(0, "utf8");
    const suppliedToken = input.endsWith("\r\n")
        ? input.slice(0, -2)
        : input.endsWith("\n")
          ? input.slice(0, -1)
          : input;
    if (!suppliedToken || suppliedToken.length > 1024 || /[\r\n]/.test(suppliedToken)) {
        throw new Error("Routing operator authorization input is invalid");
    }
    const expected = Buffer.from(expectedHex, "hex");
    const supplied = crypto.createHash("sha256").update(suppliedToken).digest();
    if (!crypto.timingSafeEqual(expected, supplied)) throw new Error("Routing operator authorization failed");
}

async function getOperationsStatus(db: Db) {
    const now = new Date();
    const collectionNames = new Set(
        (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    const count = (name: string, filter: Record<string, unknown> = {}) =>
        collectionNames.has(name) ? db.collection(name).countDocuments(filter) : Promise.resolve(0);
    const routing = await getRegistrationRouting(db.collection("registrationRouting"));
    const configuredDeploymentId = process.env.REGISTRATION_DEPLOYMENT_ID || null;
    return {
        routing,
        configuredDeploymentId,
        deploymentIdMatches:
            routing.mode !== "pending" ||
            Boolean(configuredDeploymentId && routing.deploymentId === configuredDeploymentId),
        pendingRegistrations: await count("pendingRegistrations", { status: { $ne: "provisioned" } }),
        reconciliationRequired: await count("pendingRegistrations", {
            reconciliationRequiredAt: { $ne: null },
            provisionedAt: { $exists: false },
        }),
        activeProvisioningLocks: await count("pendingRegistrationProvisioningLocks", { expiresAt: { $gt: now } }),
        activeFinalizationLocks: await count("pendingRegistrationFinalizationLocks", { expiresAt: { $gt: now } }),
    };
}

async function getRecoveryActivationStatus(db: Db) {
    const now = new Date();
    const collectionNames = new Set(
        (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    if (!collectionNames.has("pendingRegistrations")) {
        return { pendingRegistrations: 0, recoverablePendingRegistrations: 0, unsafePendingRegistrations: 0 };
    }
    const registrations = db.collection("pendingRegistrations");
    const pending = await registrations.find({ status: { $ne: "provisioned" } }, { projection: { _id: 1 } }).toArray();
    const candidates = await registrations
        .find(
            {
                status: "email_verified",
                verifiedAt: { $type: "date" },
                verifiedContinuationExpiresAt: { $lte: now },
                expiresAt: { $gt: now },
                reservedDid: null,
                reconciliationRequiredAt: null,
                accountId: null,
                accountDid: null,
                provisionedAt: null,
                provisioningClaimHash: null,
            },
            { projection: { _id: 1 } },
        )
        .toArray();
    let recoverablePendingRegistrations = 0;
    for (const candidate of candidates) {
        const pendingRegistrationId = candidate._id.toString();
        const [reservation, correlatedAccount] = await Promise.all([
            collectionNames.has("pendingRegistrationDidReservations")
                ? db
                      .collection<{ _id: string }>("pendingRegistrationDidReservations")
                      .findOne({ _id: pendingRegistrationId })
                : null,
            collectionNames.has("circles")
                ? db.collection("circles").findOne({ "metadata.pendingRegistrationId": pendingRegistrationId })
                : null,
        ]);
        if (!reservation && !correlatedAccount) recoverablePendingRegistrations += 1;
    }
    return {
        pendingRegistrations: pending.length,
        recoverablePendingRegistrations,
        unsafePendingRegistrations: pending.length - recoverablePendingRegistrations,
    };
}

async function run(db: Db) {
    if (command === "inspect") {
        const usersDirectory = args.get("users-dir");
        if (!usersDirectory) throw new Error("--users-dir is required");
        const results = await inspectPendingRegistrationReconciliation(db, {
            usersDirectory,
            pendingRegistrationId: args.get("pending-id"),
        });
        console.log(JSON.stringify({ count: results.length, results }, null, 2));
        return;
    }
    if (command === "route-status") {
        console.log(JSON.stringify(await getRegistrationRouting(db.collection("registrationRouting")), null, 2));
        return;
    }
    if (command === "operations-status") {
        console.log(JSON.stringify(await getOperationsStatus(db), null, 2));
        return;
    }
    if (command === "recovery-activation-status") {
        console.log(JSON.stringify(await getRecoveryActivationStatus(db), null, 2));
        return;
    }
    if (command === "route-set") {
        if (args.get("confirm") !== "SET_REGISTRATION_ROUTE") throw new Error("Explicit confirmation is required");
        authenticateRoutingOperator();
        const routing = await ensureRegistrationRoutingRecord(db, args.get("actor") || "operator-cli");
        const expectedMode = args.get("expected") as RegistrationMode;
        const mode = args.get("to") as RegistrationMode;
        if (
            !["legacy", "paused", "pending"].includes(expectedMode) ||
            !["legacy", "paused", "pending"].includes(mode)
        ) {
            throw new Error("Invalid routing mode");
        }
        if (!allowedTransitions.has(`${expectedMode}:${mode}`)) {
            throw new Error(`Unsupported routing transition: ${expectedMode} -> ${mode}`);
        }
        const deploymentArgument = args.get("deployment-id");
        const deploymentId = !deploymentArgument || deploymentArgument === "none" ? null : deploymentArgument;
        if (mode === "pending") {
            const configuredDeploymentId = process.env.REGISTRATION_DEPLOYMENT_ID;
            if (!configuredDeploymentId || deploymentId !== configuredDeploymentId) {
                throw new Error("Pending routing deployment id does not match REGISTRATION_DEPLOYMENT_ID");
            }
        } else if (deploymentId) {
            throw new Error(`${mode} routing requires --deployment-id none`);
        }
        const changed = await setRegistrationMode(
            { expectedMode, mode, deploymentId, updatedBy: args.get("actor") || "operator-cli" },
            db.collection("registrationRouting"),
        );
        if (!changed) throw new Error(`Routing change rejected; current mode is ${routing.mode}`);
        console.log(JSON.stringify(await getRegistrationRouting(db.collection("registrationRouting")), null, 2));
        return;
    }
    throw new Error("Usage: inspect, route-status, operations-status, recovery-activation-status, or route-set");
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    const client = new MongoClient(uri);
    try {
        await client.connect();
        await run(client.db(process.env.CIRCLES_MONGODB_DATABASE || "circles"));
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Operator command failed");
    process.exit(1);
});

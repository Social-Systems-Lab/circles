import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";
import {
    ensureRegistrationRoutingRecord,
    getRegistrationRouting,
    setRegistrationMode,
    type RegistrationMode,
} from "@/lib/auth/registration-routing";
import { getDb } from "@/lib/data/db";
import crypto from "crypto";

const command = process.argv[2];
const args = new Map<string, string>();
for (let index = 3; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "end"}`);
    args.set(key.slice(2), value);
}

async function main() {
    const db = await getDb();
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
    if (command === "route-set") {
        if (args.get("confirm") !== "SET_REGISTRATION_ROUTE") throw new Error("Explicit confirmation is required");
        const operatorToken = process.env.REGISTRATION_ROUTING_OPERATOR_TOKEN;
        const suppliedToken = args.get("operator-token");
        if (!operatorToken || !suppliedToken) throw new Error("Routing operator authorization is not configured");
        const expected = crypto.createHash("sha256").update(operatorToken).digest();
        const supplied = crypto.createHash("sha256").update(suppliedToken).digest();
        if (!crypto.timingSafeEqual(expected, supplied)) throw new Error("Routing operator authorization failed");
        const routing = await ensureRegistrationRoutingRecord(db, args.get("actor") || "operator-cli");
        const expectedMode = args.get("expected") as RegistrationMode;
        const mode = args.get("to") as RegistrationMode;
        if (
            !["legacy", "paused", "pending"].includes(expectedMode) ||
            !["legacy", "paused", "pending"].includes(mode)
        ) {
            throw new Error("Invalid routing mode");
        }
        const deploymentArgument = args.get("deployment-id");
        const deploymentId = !deploymentArgument || deploymentArgument === "none" ? null : deploymentArgument;
        const changed = await setRegistrationMode(
            { expectedMode, mode, deploymentId, updatedBy: args.get("actor") || "operator-cli" },
            db.collection("registrationRouting"),
        );
        if (!changed) throw new Error(`Routing change rejected; current mode is ${routing.mode}`);
        console.log(JSON.stringify(await getRegistrationRouting(db.collection("registrationRouting")), null, 2));
        return;
    }
    throw new Error("Usage: inspect, route-status, or route-set");
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Operator command failed");
    process.exit(1);
});

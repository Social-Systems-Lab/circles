import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    getRegistrationRouting,
    isRegistrationModeAllowed,
    setRegistrationMode,
    type RegistrationRoutingRecord,
} from "@/lib/auth/registration-routing";

function harness(initial: RegistrationRoutingRecord | null = null) {
    let record = initial;
    return {
        async createIndex() {
            return "mode";
        },
        async findOne(filter: any) {
            return record && record._id === filter._id ? { ...record } : null;
        },
        async findOneAndUpdate(filter: any, update: any) {
            if (!record || record._id !== filter._id || record.mode !== filter.mode) return null;
            record = { ...record, ...update.$set };
            return { ...record };
        },
        get record() {
            return record;
        },
    };
}

async function main() {
    const legacyAction = readFileSync("src/components/forms/signup/actions.ts", "utf8");
    const pendingRuntime = readFileSync("src/lib/auth/pending-registration-runtime.ts", "utf8");
    assert.match(legacyAction, /await assertRegistrationMode\("legacy"\)/);
    assert.match(pendingRuntime, /await assertRegistrationMode\("pending"\)/);
    assert.match(
        pendingRuntime,
        /pendingRegistrationFinalizationLocks/,
        "pending finalization uses a cross-instance lock before membership side effects",
    );
    const empty = harness();
    assert.equal((await getRegistrationRouting(empty as any)).mode, "legacy");
    assert.equal(await isRegistrationModeAllowed("legacy", empty as any), true, "missing control fails safe to legacy");
    assert.equal(await isRegistrationModeAllowed("pending", empty as any), false);

    const records = harness({
        _id: "registration-routing",
        mode: "legacy",
        deploymentId: null,
        updatedAt: new Date(0),
        updatedBy: "test",
    });
    assert.equal(
        await setRegistrationMode(
            { expectedMode: "pending", mode: "paused", deploymentId: null, updatedBy: "test" },
            records as any,
        ),
        false,
        "compare-and-set rejects a stale operator transition",
    );
    assert.equal(
        await setRegistrationMode(
            { expectedMode: "legacy", mode: "paused", deploymentId: null, updatedBy: "test" },
            records as any,
        ),
        true,
    );
    assert.equal(await isRegistrationModeAllowed("legacy", records as any), false, "paused blocks legacy");
    assert.equal(await isRegistrationModeAllowed("pending", records as any), false, "paused blocks pending");
    assert.equal(
        await setRegistrationMode(
            { expectedMode: "paused", mode: "pending", deploymentId: null, updatedBy: "test" },
            records as any,
        ),
        false,
        "pending mode requires a deployment id",
    );
    assert.equal(
        await setRegistrationMode(
            { expectedMode: "paused", mode: "pending", deploymentId: "release-123", updatedBy: "test" },
            records as any,
        ),
        true,
    );
    const originalDeployment = process.env.REGISTRATION_DEPLOYMENT_ID;
    process.env.REGISTRATION_DEPLOYMENT_ID = "another-release";
    assert.equal(await isRegistrationModeAllowed("pending", records as any), false, "mixed deployment fails closed");
    process.env.REGISTRATION_DEPLOYMENT_ID = "release-123";
    assert.equal(await isRegistrationModeAllowed("pending", records as any), true);
    if (originalDeployment === undefined) delete process.env.REGISTRATION_DEPLOYMENT_ID;
    else process.env.REGISTRATION_DEPLOYMENT_ID = originalDeployment;
    console.log("registration-routing tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

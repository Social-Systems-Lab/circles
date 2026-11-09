import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { runDerivedResourceVectorSafeMutation } from "./derived-vector-publication";

const resourceId = new ObjectId().toHexString();

const dependencies = (calls: string[], options: { enabled?: boolean; failVerification?: boolean } = {}) => ({
    isEnabled: () => options.enabled ?? true,
    deleteResources: async () => {
        calls.push("vector-delete");
    },
    assertResourcesAbsent: async () => {
        calls.push("vector-verify");
        if (options.failVerification) throw new Error("vector service unavailable");
    },
    reconcileResource: async () => {
        calls.push("vector-reconcile");
    },
});

async function main() {
    const enabledCalls: string[] = [];
    await runDerivedResourceVectorSafeMutation(
        {
            kind: "events",
            resourceId,
            mutate: async () => {
                enabledCalls.push("mongo-delete");
                return { deletedCount: 1 };
            },
            didMutate: (result) => result.deletedCount > 0,
        },
        dependencies(enabledCalls),
    );
    assert.deepEqual(enabledCalls, ["vector-delete", "vector-verify", "mongo-delete", "vector-reconcile"]);

    const disabledCalls: string[] = [];
    await runDerivedResourceVectorSafeMutation(
        {
            kind: "events",
            resourceId,
            mutate: async () => {
                disabledCalls.push("mongo-delete");
                return { deletedCount: 1 };
            },
            didMutate: (result) => result.deletedCount > 0,
        },
        dependencies(disabledCalls, { enabled: false }),
    );
    assert.deepEqual(disabledCalls, ["mongo-delete"], "disabled VDB performs no vector operation");

    const failureCalls: string[] = [];
    await assert.rejects(
        runDerivedResourceVectorSafeMutation(
            {
                kind: "events",
                resourceId,
                mutate: async () => {
                    failureCalls.push("must-not-delete");
                    return { deletedCount: 1 };
                },
                didMutate: (result) => result.deletedCount > 0,
            },
            dependencies(failureCalls, { failVerification: true }),
        ),
        /vector service unavailable/,
    );
    assert.deepEqual(failureCalls, ["vector-delete", "vector-verify"]);

    console.log("event deletion VDB tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

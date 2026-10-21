import assert from "node:assert/strict";
import { runSingleFlight } from "./async-request-utils";

const run = async () => {
    const gate = { inFlight: false };
    let releaseFirst!: () => void;
    let requestCount = 0;
    const firstRequest = runSingleFlight(gate, async () => {
        requestCount += 1;
        await new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
    });

    assert.equal(await runSingleFlight(gate, async () => void (requestCount += 1)), false);
    assert.equal(requestCount, 1, "an interval tick cannot overlap an active request");

    releaseFirst();
    assert.equal(await firstRequest, true);
    assert.equal(await runSingleFlight(gate, async () => void (requestCount += 1)), true);
    assert.equal(requestCount, 2, "a later interval tick runs after the active request completes");

    await assert.rejects(
        runSingleFlight(gate, async () => {
            throw new Error("expected failure");
        }),
        /expected failure/,
    );
    assert.equal(gate.inFlight, false, "a failed request releases the single-flight gate");

    console.log("async request single-flight tests passed");
};

void run();

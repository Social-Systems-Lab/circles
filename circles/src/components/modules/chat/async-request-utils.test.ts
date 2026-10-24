import assert from "node:assert/strict";
import { deliverAcceptedPollPage, runSingleFlight } from "./async-request-utils";

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

    const events: string[] = [];
    assert.equal(
        await deliverAcceptedPollPage({
            isStale: () => false,
            publish: () => events.push("published"),
            advanceCursor: () => events.push("cursor"),
            acknowledge: async () => {
                events.push("acknowledge");
                throw new Error("read acknowledgement unavailable");
            },
            onAcknowledgementError: () => events.push("acknowledgement-error"),
        }),
        true,
    );
    assert.deepEqual(
        events,
        ["published", "cursor", "acknowledge", "acknowledgement-error"],
        "read acknowledgement failure cannot drop an accepted poll page or its cursor",
    );

    const staleEvents: string[] = [];
    assert.equal(
        await deliverAcceptedPollPage({
            isStale: () => true,
            publish: () => staleEvents.push("published"),
            advanceCursor: () => staleEvents.push("cursor"),
            acknowledge: async () => void staleEvents.push("acknowledge"),
        }),
        false,
        "a poll page from a previous conversation is discarded",
    );
    assert.deepEqual(staleEvents, [], "a stale poll page cannot publish state or advance the new room cursor");

    console.log("async request single-flight tests passed");
};

void run();

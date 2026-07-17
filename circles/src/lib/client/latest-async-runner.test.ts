import assert from "node:assert/strict";
import { createLatestAsyncRunner } from "./latest-async-runner";

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const testStaleResponseCannotOverwrite = async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const loads = [first.promise, second.promise];
    const accepted: number[] = [];
    let loadIndex = 0;

    const runner = createLatestAsyncRunner({
        load: () => loads[loadIndex++],
        apply: (value) => accepted.push(value),
    });

    const runPromise = runner.run();
    void runner.run();
    first.resolve(1);
    await Promise.resolve();
    second.resolve(2);
    await runPromise;

    assert.deepEqual(accepted, [2], "stale older unread response cannot overwrite a newer response");
};

const testLatestResponseApplies = async () => {
    const latest = deferred<number>();
    const accepted: number[] = [];
    const runner = createLatestAsyncRunner({
        load: () => latest.promise,
        apply: (value) => accepted.push(value),
    });

    const runPromise = runner.run();
    latest.resolve(7);
    await runPromise;

    assert.deepEqual(accepted, [7], "latest response updates visible state");
};

const testFailureResetsGuard = async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const loads = [first.promise, second.promise];
    const accepted: number[] = [];
    let loadIndex = 0;
    let errorCount = 0;

    const runner = createLatestAsyncRunner({
        load: () => loads[loadIndex++],
        apply: (value) => accepted.push(value),
        onError: () => {
            errorCount += 1;
        },
    });

    const runPromise = runner.run();
    void runner.run();
    first.reject(new Error("stale failure"));
    await Promise.resolve();
    second.resolve(3);
    await runPromise;

    assert.equal(errorCount, 0, "stale failures are discarded when a newer refresh is queued");
    assert.deepEqual(accepted, [3], "request guard resets after stale failure and accepts the final refresh");
};

const testRapidRefreshesCoalesce = async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const third = deferred<number>();
    const loads = [first.promise, second.promise, third.promise];
    const accepted: number[] = [];
    let loadIndex = 0;

    const runner = createLatestAsyncRunner({
        load: () => loads[loadIndex++],
        apply: (value) => accepted.push(value),
    });

    const runPromise = runner.run();
    void runner.run();
    void runner.run();
    first.resolve(1);
    await Promise.resolve();
    second.resolve(2);
    await runPromise;

    assert.deepEqual(accepted, [2], "rapid refresh events coalesce to one final accepted state");
    assert.equal(loadIndex, 2, "rapid refresh events avoid unnecessary simultaneous requests");
    third.resolve(3);
};

const main = async () => {
    await testStaleResponseCannotOverwrite();
    await testLatestResponseApplies();
    await testFailureResetsGuard();
    await testRapidRefreshesCoalesce();
    console.log("latest-async-runner tests passed");
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

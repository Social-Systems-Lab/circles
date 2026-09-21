// Keeps a test file from ending the whole test run by calling `process.exit`. Imported by src/test/setup.ts.
//
// Many older tests here are plain scripts (top-level `node:assert`, no `bun:test`) that finish with
// `process.exit(0)` or `process.exit(1)`. Run on their own with `bun <file>` that is what they should do.
// Loaded into a `bun test` run, the first one to finish would end the process, and with it every test file
// that had not run yet — with exit code 0, so the run looked green while skipping most of the suite.
//
//   process.exit(0) / process.exit()  a script announcing that it passed: carry on with the next file.
//   process.exit(n), n != 0           a script announcing that it failed: throw, so the runner reports it.
//
// Known limit: some scripts report failure with `process.exitCode = 1` instead. Bun does not let that
// property be intercepted, so it is left alone. A sequential run (`bun test --isolate`, which is what
// `bun run test` uses) exits non-zero for it; `bun test --parallel` drops it when more than one file runs,
// so a failing script-style test can pass there. Use the sequential mode where the result has to be trusted.

const CONTAINED = Symbol.for("circles.test.processExitContained");

const guarded = process as typeof process & { [CONTAINED]?: true };

if (!guarded[CONTAINED]) {
    guarded[CONTAINED] = true;

    process.exit = ((code?: number | string | null) => {
        if (code === undefined || code === null || Number(code) === 0) {
            return undefined as never;
        }
        throw new Error(`process.exit(${code}) was called while running tests`);
    }) as typeof process.exit;
}

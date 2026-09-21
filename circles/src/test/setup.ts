// Global test setup, preloaded by bun test (see bunfig.toml).
//
// Two constraints decide how this file is written.
//
// 1. Testing Library must be evaluated after happy-dom is registered, because it binds to `document` when it
//    loads. It and jest-dom are CommonJS, and Bun runs a CommonJS dependency while it is *loading* an ES
//    module's imports, ahead of every ES module body — so a static `import` would evaluate them first. They
//    are `require`d below instead, which runs at the call, after "./register-dom" has run.
//
// 2. Nothing here may sit behind a top-level `await`. Under `bun test --isolate` a preload's code after an
//    `await` runs too late, so `expect.extend` and `afterEach` would be silently lost and every jest-dom
//    matcher would be undefined. (This is why the original `await import(...)` had to go.)

import "./isolate-bare-run"; // first: a bare `bun test` re-runs itself and exits before anything else loads
import "./register-dom";
import "./contain-process-exit";

import { afterEach, expect } from "bun:test";

const matchers: typeof import("@testing-library/jest-dom/matchers") = require("@testing-library/jest-dom/matchers");
const { act, cleanup }: typeof import("@testing-library/react") = require("@testing-library/react");

expect.extend({ ...matchers } as Parameters<typeof expect.extend>[0]);

// React Testing Library only auto-cleans up when a global afterEach exists,
// which bun test does not provide, so register it explicitly. Settle any
// leftover Floating UI microtasks under act before unmounting.
afterEach(async () => {
    await act(async () => {});
    cleanup();
});

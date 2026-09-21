/**
 * Runs the `bun:test` module tests (everything under src that is not a React component test).
 *
 *   bun scripts/run-module-tests.ts            # all module tests
 *   bun scripts/run-module-tests.ts lib/auth   # only files whose path contains "lib/auth"
 *
 * Why this exists instead of a plain `bun test src`:
 *  - Module tests replace modules with `mock.module` (most importantly `@/lib/data/db`, which opens a real
 *    MongoClient when imported). Bun keeps those mocks for the whole process, so each file must run in
 *    its own module registry: `--isolate`.
 *  - The older script-style tests under src/lib (top-level `node:assert`, no `bun:test`) are meant to be
 *    run one at a time with `bun <file>`. Many of them call `process.exit`, which would end the whole
 *    run early, so only files that import `bun:test` are selected here.
 *
 * React component tests (`*.test.tsx`) have their own script: `bun run test:components`.
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const filters = process.argv.slice(2);

const files = [...new Glob("src/**/*.test.ts").scanSync({ cwd: root })]
    .filter((file) => readFileSync(join(root, file), "utf8").includes('from "bun:test"'))
    .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
    .sort();

if (files.length === 0) {
    console.error(`No bun:test module tests found${filters.length ? ` matching: ${filters.join(", ")}` : ""}.`);
    process.exit(1);
}

const child = Bun.spawn(["bun", "test", "--isolate", ...files.map((file) => `./${file}`)], {
    cwd: root,
    stdio: ["inherit", "inherit", "inherit"],
});

process.exit(await child.exited);

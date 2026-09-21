// Makes a bare `bun test` run each test file in isolation. Imported first by src/test/setup.ts.
//
// Many module tests replace modules with `mock.module`. Bun keeps those mocks for the whole process and cannot
// undo them, so in one shared process a file that mocks `@/lib/data/db` (or `member`, `circle`, ...) leaves
// every later file importing a half-empty module: "SyntaxError: Export named 'x' not found in module ...".
// `bun test --isolate` runs each file in its own module registry and avoids that, but Bun 1.3 offers no bunfig
// setting for it, and a preload is never told which arguments the command had.
//
// What a preload can do is read its own command line from the operating system. When that is exactly
// `bun test`, this re-runs the same command with `--isolate` and exits with its status. Anything with an
// argument (`bun test --isolate`, `bun test --parallel`, `bun test some/dir`, an editor running one file)
// is left alone and runs as asked. Nothing else here changes what a test does.
//
// This is a workaround for a Bun limitation. If a Bun release adds `isolate` to bunfig.toml, set it there and
// delete this file and its import in setup.ts.
//
// It fails safe: if the command line cannot be read (no /proc, no `ps`, Windows) nothing happens.

import { readFileSync } from "node:fs";

const RERUN_MARKER = "CIRCLES_TEST_ISOLATED_RERUN";

const readCommandLine = (): string[] | undefined => {
    try {
        // Linux: exact, NUL-separated arguments.
        return readFileSync("/proc/self/cmdline", "utf8").split("\0").filter(Boolean);
    } catch {
        // No /proc.
    }
    try {
        // macOS and other Unixes: the arguments joined by spaces, which is enough to recognise a bare `bun test`.
        const result = Bun.spawnSync(["ps", "-ww", "-o", "command=", "-p", String(process.pid)]);
        if (result.exitCode === 0) return result.stdout.toString().trim().split(/\s+/);
    } catch {
        // No `ps`.
    }
    return undefined;
};

const isBareBunTest = (args: string[] | undefined): boolean => args?.length === 2 && args[1] === "test";

if (!process.env[RERUN_MARKER] && isBareBunTest(readCommandLine())) {
    console.error("bun test: running with --isolate, because module mocks need a fresh module registry per file.");

    const child = Bun.spawnSync([process.execPath, "test", "--isolate"], {
        stdio: ["inherit", "inherit", "inherit"],
        env: { ...process.env, [RERUN_MARKER]: "1" },
    });

    process.exit(child.exitCode ?? 1);
}

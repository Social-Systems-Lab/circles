import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setEnv, snapshotEnv } from "@/test/env";

// The candidate VERSION paths are resolved from process.cwd() when the module loads, so the module is
// imported from inside a scratch working directory that each test fills as needed.
const originalCwd = process.cwd();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "circles-version-test-"));
process.chdir(workDir);

const restoreEnv = snapshotEnv("APP_VERSION", "GIT_SHA", "BUILD_TIME");
const { GET } = await import("./route");

const versionFile = path.join(workDir, "VERSION");
const packageFile = path.join(workDir, "package.json");

beforeEach(() => {
    for (const name of ["APP_VERSION", "GIT_SHA", "BUILD_TIME"]) setEnv(name, undefined);
    fs.rmSync(versionFile, { force: true });
    fs.rmSync(packageFile, { force: true });
});

afterEach(restoreEnv);

afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
});

const read = async () => (await GET()).json();

describe("GET /api/version", () => {
    test("reports unknown for everything when nothing is configured", async () => {
        expect(await read()).toEqual({ version: "unknown", gitSha: "unknown", buildTime: "unknown" });
    });

    test("must never be cached", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate, proxy-revalidate");
        expect(response.headers.get("pragma")).toBe("no-cache");
        expect(response.headers.get("expires")).toBe("0");
    });

    describe("sources, in order of precedence", () => {
        test("falls back to the package.json version", async () => {
            fs.writeFileSync(packageFile, JSON.stringify({ version: "0.8.15" }));

            expect((await read()).version).toBe("0.8.15");
        });

        test("prefers APP_VERSION over package.json", async () => {
            fs.writeFileSync(packageFile, JSON.stringify({ version: "0.8.15" }));
            setEnv("APP_VERSION", "1.2.3");

            expect((await read()).version).toBe("1.2.3");
        });

        test("prefers the VERSION file over APP_VERSION and package.json", async () => {
            fs.writeFileSync(packageFile, JSON.stringify({ version: "0.8.15" }));
            setEnv("APP_VERSION", "1.2.3");
            fs.writeFileSync(versionFile, "version=9.9.9\n");

            expect((await read()).version).toBe("9.9.9");
        });

        test("reads the git sha and build time from the environment", async () => {
            setEnv("GIT_SHA", "abc123");
            setEnv("BUILD_TIME", "2026-06-15T12:00:00Z");

            expect(await read()).toMatchObject({ gitSha: "abc123", buildTime: "2026-06-15T12:00:00Z" });
        });

        test("prefers the VERSION file for the git sha and build time", async () => {
            setEnv("GIT_SHA", "from-env");
            setEnv("BUILD_TIME", "from-env");
            fs.writeFileSync(versionFile, "gitSha=from-file\nbuildTime=2026-01-01T00:00:00Z\n");

            expect(await read()).toMatchObject({ gitSha: "from-file", buildTime: "2026-01-01T00:00:00Z" });
        });

        test("mixes sources per field", async () => {
            setEnv("BUILD_TIME", "from-env");
            fs.writeFileSync(versionFile, "gitSha=from-file\n");

            expect(await read()).toEqual({ version: "unknown", gitSha: "from-file", buildTime: "from-env" });
        });
    });

    describe("VERSION file format", () => {
        test("reads key=value lines", async () => {
            fs.writeFileSync(versionFile, "version=1.0.0\ngitSha=deadbeef\nbuildTime=today\n");

            expect(await read()).toEqual({ version: "1.0.0", gitSha: "deadbeef", buildTime: "today" });
        });

        test("ignores comments, blank lines and lines without an equals sign", async () => {
            fs.writeFileSync(versionFile, "# a comment\n\nnot a pair\nversion=1.0.0\n  # indented comment\n");

            expect(await read()).toMatchObject({ version: "1.0.0", gitSha: "unknown" });
        });

        test("trims keys, values and surrounding whitespace", async () => {
            fs.writeFileSync(versionFile, "   version  =   1.0.0   \n");

            expect((await read()).version).toBe("1.0.0");
        });

        test("splits only on the first equals sign so values can contain one", async () => {
            fs.writeFileSync(versionFile, "buildTime=a=b=c\n");

            expect((await read()).buildTime).toBe("a=b=c");
        });

        test("ignores keys with an empty value so the next source applies", async () => {
            setEnv("GIT_SHA", "from-env");
            fs.writeFileSync(versionFile, "gitSha=\n");

            expect((await read()).gitSha).toBe("from-env");
        });

        test("ignores unknown keys", async () => {
            fs.writeFileSync(versionFile, "secret=hunter2\nversion=1.0.0\n");

            const body = await read();

            expect(body).toEqual({ version: "1.0.0", gitSha: "unknown", buildTime: "unknown" });
            expect(JSON.stringify(body)).not.toContain("hunter2");
        });

        test("matches keys case-sensitively", async () => {
            fs.writeFileSync(versionFile, "Version=1.0.0\nGITSHA=abc\n");

            expect(await read()).toEqual({ version: "unknown", gitSha: "unknown", buildTime: "unknown" });
        });

        test("uses the last value when a key repeats", async () => {
            fs.writeFileSync(versionFile, "version=1.0.0\nversion=2.0.0\n");

            expect((await read()).version).toBe("2.0.0");
        });

        test("handles Windows line endings by trimming the carriage return", async () => {
            fs.writeFileSync(versionFile, "version=1.0.0\r\ngitSha=abc\r\n");

            expect(await read()).toMatchObject({ version: "1.0.0", gitSha: "abc" });
        });

        test("treats an empty file as having no metadata", async () => {
            fs.writeFileSync(versionFile, "");
            setEnv("GIT_SHA", "from-env");

            expect((await read()).gitSha).toBe("from-env");
        });
    });

    describe("package.json", () => {
        test.each([
            ["is not valid JSON", "{broken"],
            ["has no version", JSON.stringify({ name: "circles" })],
            ["has an empty version", JSON.stringify({ version: "" })],
        ])("reports unknown when it %s", async (_label, contents) => {
            fs.writeFileSync(packageFile, contents);

            expect((await read()).version).toBe("unknown");
        });

        test("does not affect the git sha or build time", async () => {
            fs.writeFileSync(packageFile, JSON.stringify({ version: "0.8.15", gitSha: "nope" }));

            expect(await read()).toMatchObject({ gitSha: "unknown", buildTime: "unknown" });
        });
    });
});

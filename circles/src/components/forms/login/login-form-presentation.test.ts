import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";

const loginFormSource = readFileSync(fileURLToPath(new URL("./login-form.tsx", import.meta.url)), "utf8");

test("login form omits the stale password warning and presents an accessible reset action", () => {
    assert.doesNotMatch(
        loginFormSource,
        /Password update required for some users|created your account before 2026/,
        "the obsolete pre-2026 warning must remain removed",
    );

    const resetAction =
        loginFormSource.match(
            /<Button\s+asChild[\s\S]*?<Link href="\/forgot-password">Reset password<\/Link>[\s\S]*?<\/Button>/,
        )?.[0] ?? "";

    assert.notEqual(resetAction, "", "Reset password remains a link-backed Button");
    assert.match(resetAction, /variant="outline"/);
    assert.match(resetAction, /size="sm"/);
    assert.match(resetAction, /border-orange-600/);
    assert.match(resetAction, /text-orange-700/);
    assert.match(resetAction, /focus-visible:ring-orange-700/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profileMenuSource = readFileSync("src/components/layout/profile-menu.tsx", "utf8");
const loginFormSource = readFileSync("src/components/forms/login/login-form.tsx", "utf8");

assert.match(
    profileMenuSource,
    /router\.push\(redirectTo \? `\/login\?redirectTo=\$\{encodeURIComponent\(redirectTo\)\}` : "\/login"\)/,
    "ordinary profile-menu login does not manufacture a homepage return URL, while an explicit return URL is preserved",
);
assert.match(
    loginFormSource,
    /searchParams\?\.get\("redirectTo"\) \?\? `\/circles\/\$\{result\.data\.user\.handle\}`/,
    "login keeps explicit return URLs ahead of the existing authenticated profile fallback",
);

console.log("login navigation tests passed");

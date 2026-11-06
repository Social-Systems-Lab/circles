import assert from "node:assert/strict";
import {
    buildPendingRegistrationRedirectUrl,
    requirePendingRegistrationPublicOrigin,
} from "./pending-registration-public-origin";

const stagingOrigin = "https://staging.kamooni.org";

assert.equal(requirePendingRegistrationPublicOrigin(`${stagingOrigin}/`), stagingOrigin);
assert.equal(
    requirePendingRegistrationPublicOrigin("http://127.0.0.1:3000", { allowLoopbackHttp: true }),
    "http://127.0.0.1:3000",
);
assert.throws(() => requirePendingRegistrationPublicOrigin("http://127.0.0.1:3000"), /public origin is unsafe/);

const success = buildPendingRegistrationRedirectUrl("/signup/continue", stagingOrigin);
assert.equal(success.toString(), `${stagingOrigin}/signup/continue`);
assert.equal(success.searchParams.has("token"), false);

const invalid = buildPendingRegistrationRedirectUrl("/signup?verification=invalid", stagingOrigin);
assert.equal(invalid.toString(), `${stagingOrigin}/signup?verification=invalid`);
assert.equal(invalid.searchParams.has("token"), false);

for (const unsafe of [
    undefined,
    "",
    "not a URL",
    "http://staging.kamooni.org",
    "https://0.0.0.0:3000",
    "https://127.0.0.1:3000",
    "https://[::1]:3000",
    "https://localhost:3000",
    "https://internal-host",
    "https://user:password@staging.kamooni.org",
    "https://staging.kamooni.org/base-path",
    "https://staging.kamooni.org/?origin=other",
    "https://staging.kamooni.org/#fragment",
]) {
    assert.throws(
        () => requirePendingRegistrationPublicOrigin(unsafe),
        /public origin is (?:not configured|invalid|unsafe)/,
        `unsafe public origin must fail closed: ${String(unsafe)}`,
    );
}

console.log("pending registration public origin tests passed");

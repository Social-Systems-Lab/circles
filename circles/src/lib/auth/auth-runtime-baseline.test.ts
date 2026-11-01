import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync("src/lib/auth/auth.ts", "utf8");
const signupActionSource = readFileSync("src/components/forms/signup/actions.ts", "utf8");
const loginActionSource = readFileSync("src/components/forms/login/actions.ts", "utf8");
const resetSource = readFileSync("src/lib/auth/actions.ts", "utf8");

assert.match(authSource, /generateKeyPairSync\("rsa", \{ modulusLength: 2048 \}\)/, "signup generates an RSA keypair");
assert.match(
    authSource,
    /createHash\("sha256"\)[\s\S]*?publicKey\.export[\s\S]*?digest\("hex"\)/,
    "the permanent DID is derived from the generated public key",
);
assert.match(
    authSource,
    /pbkdf2Sync\(password, salt, 100000, 32, "sha512"\)/,
    "password derives the private-key encryption key",
);
for (const filename of ["SALT_FILENAME", "IV_FILENAME", "PUBLIC_KEY_FILENAME", "ENCRYPTED_PRIVATE_KEY_FILENAME"]) {
    assert.match(
        authSource,
        new RegExp(`writeFileSync\\(path\\.join\\(accountPath, ${filename}\\)`),
        `${filename} is written during signup`,
    );
}
assert.match(
    authSource,
    /const verificationTokenExpiry = unhashedVerificationToken \? new Date\(Date\.now\(\) \+ 24 \* 3600 \* 1000\) : undefined/,
    "signup token expires after 24 hours",
);
assert.match(
    authSource,
    /options: \{[\s\S]*?emailAlreadyVerified\?: boolean[\s\S]*?\} = \{\}/,
    "legacy signup keeps the compatibility options disabled by default",
);
assert.match(
    authSource,
    /if \(options\.reserveDid\) await options\.reserveDid\(did\)/,
    "pending registration can durably reserve its generated DID before credential files are written",
);
assert.ok(
    authSource.indexOf("if (options.reserveDid) await options.reserveDid(did)") <
        authSource.indexOf("fs.mkdirSync(accountPath"),
    "DID reservation happens before the credential directory is created",
);
assert.match(
    authSource,
    /hashToken\(unhashedVerificationToken\)/,
    "signup persists a hash rather than the raw verification token",
);
assert.match(authSource, /Circles\.insertOne\(user\)/, "signup inserts the permanent user before verification");
assert.match(authSource, /await addMember\(did, user\._id!/, "signup creates self-membership before verification");
assert.match(
    signupActionSource,
    /await createUserSession\(user as UserPrivate, user\.did!\)/,
    "signup authenticates before email verification",
);
assert.match(
    signupActionSource,
    /ensureWelcomeMessageForNewUser/,
    "signup attempts welcome-chat creation before verification",
);
assert.match(
    signupActionSource,
    /guardPilotSignup\(values, clientIp, \{[\s\S]*?verifyAltcha: verifyAltchaPayload/,
    "signup performs server-side ALTCHA verification",
);

assert.match(
    loginActionSource,
    /TEMPORARILY DISABLED FOR TESTING[\s\S]*?if \(!user\.isEmailVerified\)[\s\S]*?\*\//,
    "current login intentionally allows an unverified account to continue",
);
assert.match(
    loginActionSource,
    /authenticateUser\(user\.did!, password\)/,
    "login authenticates against existing DID credentials",
);

assert.match(resetSource, /const existingDid = user\.did/, "password reset captures the existing DID");
assert.match(
    resetSource,
    /accountPath = path\.join\(USERS_DIR, existingDid\)/,
    "password reset updates credentials under the existing DID path",
);
assert.doesNotMatch(resetSource, /\$set:\s*\{[^}]*did:/, "password reset does not update the persisted DID");
assert.match(
    resetSource,
    /if \(!privateKeyPem\)[\s\S]*?generateKeyPairSync\("rsa", \{ modulusLength: 2048 \}\)/,
    "current reset regenerates key material when a plaintext private key cannot be recovered",
);

console.log("authentication runtime baseline tests passed");

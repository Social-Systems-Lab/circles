import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "circles-auth-private-key-validation-"));
process.env.APP_DIR = fixtureDir;
process.env.IS_BUILD = "true";
Reflect.set(process.env, "NODE_ENV", "production");

const {
    AuthenticationError,
    ENCRYPTED_PRIVATE_KEY_FILENAME,
    ENCRYPTION_ALGORITHM,
    IV_FILENAME,
    SALT_FILENAME,
    USERS_DIR,
    authenticateUser,
    getUserPrivateKey,
} = await import("./auth");

const correctPassword = "correct horse battery staple";

function writeEncryptedCredential(did: string, plaintext: string, password = correctPassword) {
    const accountPath = path.join(USERS_DIR, did);
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512");
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    const encrypted = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");

    fs.mkdirSync(accountPath, { recursive: true });
    fs.writeFileSync(path.join(accountPath, SALT_FILENAME), salt);
    fs.writeFileSync(path.join(accountPath, IV_FILENAME), iv);
    fs.writeFileSync(path.join(accountPath, ENCRYPTED_PRIVATE_KEY_FILENAME), encrypted);

    return { encrypted, iv, salt };
}

function assertIncorrectPassword(action: () => unknown) {
    assert.throws(
        action,
        (error: unknown) => error instanceof AuthenticationError && error.message === "Incorrect password",
        "authentication failure must use the generic incorrect-password error",
    );
}

try {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const validDid = "valid-generated-credential";
    writeEncryptedCredential(validDid, privateKeyPem);

    assert.equal(
        getUserPrivateKey(validDid, correctPassword),
        privateKeyPem,
        "existing PKCS#1 credentials still decrypt",
    );
    assert.equal(authenticateUser(validDid, correctPassword), true, "the correct password authenticates");
    assertIncorrectPassword(() => authenticateUser(validDid, "definitely-wrong-password"));

    const invalidDid = "padding-valid-invalid-key";
    const invalidPlaintext = "padding is valid, but this plaintext is not a private key";
    const invalidFixture = writeEncryptedCredential(invalidDid, invalidPlaintext);
    const fixtureKey = crypto.pbkdf2Sync(correctPassword, invalidFixture.salt, 100000, 32, "sha512");
    const fixtureDecipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, fixtureKey, invalidFixture.iv);
    const decryptedInvalidPlaintext =
        fixtureDecipher.update(invalidFixture.encrypted, "hex", "utf8") + fixtureDecipher.final("utf8");

    assert.equal(decryptedInvalidPlaintext, invalidPlaintext, "the regression fixture passes CBC padding validation");
    assert.throws(
        () => crypto.createPrivateKey(decryptedInvalidPlaintext),
        "the padding-valid regression fixture is not a private key",
    );
    assertIncorrectPassword(() => getUserPrivateKey(invalidDid, correctPassword));

    for (let candidate = 0; candidate < 5000; candidate += 1) {
        assertIncorrectPassword(() => authenticateUser(validDid, `wrong-password-${candidate}`));
    }

    console.log("private-key validation auth regression tests passed");
} finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
}

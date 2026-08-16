import assert from "node:assert/strict";
import { errors } from "jose";
import { resolveAuthenticatedViewerDid } from "./authenticated-viewer";

async function main() {
    assert.equal(
        await resolveAuthenticatedViewerDid(async () => {
            throw new errors.JWTInvalid("invalid token");
        }),
        undefined,
        "expected JOSE validation failures are treated as anonymous",
    );

    const unexpected = new Error("authentication infrastructure failed");
    await assert.rejects(
        resolveAuthenticatedViewerDid(async () => {
            throw unexpected;
        }),
        (error) => error === unexpected,
        "unexpected authentication failures remain observable",
    );

    assert.equal(await resolveAuthenticatedViewerDid(async () => "did:valid"), "did:valid");
    console.log("authenticated viewer tests passed");
}

void main();

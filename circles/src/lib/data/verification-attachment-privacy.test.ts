import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
    canReadVerificationAttachment,
    getVerificationAttachmentAccess,
    serializeVerificationAttachment,
    verificationAttachmentUrl,
} from "@/lib/data/verification-attachment-access";
import { isLegacyVerificationObject, VERIFICATION_STORAGE_SCHEME } from "@/lib/data/storage";

const request = { userDid: "did:owner" };

assert.equal(
    getVerificationAttachmentAccess(undefined, false, request),
    "not_found",
    "anonymous verification attachment retrieval fails neutrally",
);
assert.equal(
    canReadVerificationAttachment("did:stranger", false, request),
    false,
    "an unrelated authenticated user cannot read verification evidence",
);
assert.equal(
    canReadVerificationAttachment("did:owner", false, request),
    true,
    "the verification subject can read their evidence",
);
assert.equal(
    canReadVerificationAttachment("did:reviewer", true, request),
    true,
    "an authorized admin reviewer can read verification evidence",
);
assert.equal(
    verificationAttachmentUrl("message-id", 2),
    "/verification-attachments/message-id/2",
    "browser DTOs expose only the authorized application route",
);

assert.equal(isLegacyVerificationObject("owner/verification-attachment123.pdf"), true);
assert.equal(isLegacyVerificationObject("owner/profile-picture123.jpg"), false, "ordinary public media remains public");

const root = process.cwd();
const attachmentRoute = fs.readFileSync(
    path.join(root, "src/app/verification-attachments/[messageId]/[attachmentIndex]/route.ts"),
    "utf8",
);
const storageRoute = fs.readFileSync(path.join(root, "src/app/storage/[...path]/route.ts"), "utf8");
const uploadsRoute = fs.readFileSync(path.join(root, "src/app/uploads/[...path]/route.ts"), "utf8");

assert.match(attachmentRoute, /if \(!viewerDid\).*404/, "anonymous attachment requests fail neutrally");
assert.match(attachmentRoute, /getVerificationAttachmentAccess/, "the download route authorizes before streaming");
assert.match(storageRoute, /isLegacyVerificationObject\(objectName\)/, "the storage proxy blocks legacy evidence");
assert.match(uploadsRoute, /isLegacyVerificationObject\(objectName\)/, "the upload proxy blocks legacy evidence");
assert.equal(VERIFICATION_STORAGE_SCHEME, "verification-private://");
assert.deepEqual(
    serializeVerificationAttachment(
        {
            url: "verification-private://request/message/private.pdf",
            fileName: "private.pdf",
            originalName: "evidence.pdf",
        },
        "message-id",
        0,
    ),
    { url: "/verification-attachments/message-id/0", originalName: "evidence.pdf" },
);

console.log("verification attachment privacy tests passed");

import assert from "node:assert/strict";
import { chunkRecipientDids, MAX_RECIPIENTS_PER_ACTION, validateRecipientInput } from "./recipient-input";

const atLimit = Array.from({ length: MAX_RECIPIENTS_PER_ACTION }, (_, index) => `did:${index}`);
assert.deepEqual(validateRecipientInput(atLimit), { ok: true, recipients: atLimit });
assert.equal(validateRecipientInput([...atLimit, "did:extra"]).ok, false);
assert.equal(validateRecipientInput(["did:valid", "", "did:also-valid"]).ok, false);
assert.deepEqual(validateRecipientInput(["did:one", "did:one", "did:two"]), {
    ok: true,
    recipients: ["did:one", "did:two"],
});

const allCircleMembers = Array.from({ length: 251 }, (_, index) => `did:${index}`);
const batches = chunkRecipientDids(allCircleMembers);
assert.deepEqual(
    batches.map((batch) => batch.length),
    [100, 100, 51],
);
assert.deepEqual(batches.flat(), allCircleMembers);
assert.deepEqual(chunkRecipientDids([]), []);

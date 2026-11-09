import assert from "node:assert/strict";
import { resolveEventCancellationRecipientDids } from "./event-cancellation-recipients";

const recipients = resolveEventCancellationRecipientDids({
    authorDid: "did:author",
    actorDid: "did:actor",
    eventRsvps: [
        { userDid: "did:going", status: "going" },
        { userDid: "did:interested", status: "interested" },
        { userDid: "did:waitlist", status: "waitlist" },
        { userDid: "did:cancelled", status: "cancelled" },
        { userDid: "did:going", status: "going" },
    ],
    eventInvitations: [
        { userDid: "did:invited", status: "pending" },
        { userDid: "did:accepted-invitee", status: "accepted" },
        { userDid: "did:declined-invitee", status: "declined" },
        { userDid: "did:going", status: "pending" },
    ],
    occurrenceRsvps: [
        { userDid: "did:occurrence-going", status: "going" },
        { userDid: "did:occurrence-none", status: "none" },
    ],
    occurrenceInvitations: [{ userDid: "did:occurrence-invited" }, { userDid: "did:invited" }],
});

assert.deepEqual(
    new Set(recipients),
    new Set([
        "did:author",
        "did:going",
        "did:interested",
        "did:waitlist",
        "did:invited",
        "did:accepted-invitee",
        "did:occurrence-going",
        "did:occurrence-invited",
    ]),
);
assert.equal(recipients.length, new Set(recipients).size, "cancellation recipients are deduplicated");
assert.equal(recipients.includes("did:actor"), false, "the initiating actor is excluded");
assert.equal(recipients.includes("did:cancelled"), false, "cancelled RSVPs are not notified");
assert.equal(recipients.includes("did:declined-invitee"), false, "declined Event invitations are not notified");
assert.equal(recipients.includes("did:accepted-invitee"), true, "accepted Event invitations are notified");
assert.equal(recipients.includes("did:invited"), true, "pending Event invitations are notified");
assert.equal(recipients.includes("did:occurrence-none"), false, "occurrence tombstones are not notified");

console.log("event cancellation recipient tests passed");

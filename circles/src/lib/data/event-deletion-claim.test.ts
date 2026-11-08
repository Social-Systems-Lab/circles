import assert from "node:assert/strict";
import {
    acquireEventDeletionClaim,
    claimFailureKindAfterEligibility,
    deleteEventRecordWithClaim,
    releaseEventDeletionClaim,
    shouldReleaseEventDeletionClaim,
    startClaimedEventDeletion,
    type EventDeletionClaimStore,
} from "./event-deletion-claim";

const eventId = "507f1f77bcf86cd799439011";

const createStore = () => {
    const claims = new Map<string, string>();
    const deleted = new Map<string, string>();
    const store: EventDeletionClaimStore = {
        acquire: async (id, token) => {
            if (claims.has(id)) return false;
            claims.set(id, token);
            return true;
        },
        release: async (id, token) => {
            if (claims.get(id) !== token) return false;
            claims.delete(id);
            return true;
        },
    };
    return { store, claims, deleted };
};

async function main() {
    const state = createStore();
    const first = await acquireEventDeletionClaim(eventId, { store: state.store, token: "claim-a" });
    const second = await acquireEventDeletionClaim(eventId, { store: state.store, token: "claim-b" });
    assert.deepEqual(first, { status: "claimed", token: "claim-a" });
    assert.deepEqual(second, { status: "not-acquired" }, "competing deletion claims are rejected");

    assert.equal(await releaseEventDeletionClaim(eventId, "claim-b", state.store), false);
    assert.equal(state.claims.get(eventId), "claim-a", "a mismatched token cannot release the claim");
    assert.equal(await releaseEventDeletionClaim(eventId, "claim-a", state.store), true);
    assert.equal(state.claims.has(eventId), false, "the matching token releases the claim");

    const blockedState = createStore();
    const blocked = await startClaimedEventDeletion(eventId, [], {
        store: blockedState.store,
        token: "blocked-claim",
        policyDependencies: {
            hasActiveEventRsvp: async () => true,
            hasEventInvitation: async () => false,
            hasActiveOccurrenceRsvp: async () => false,
            hasOccurrenceInvitation: async () => false,
        },
    });
    assert.equal(blocked.status, "participation-blocked");
    if (blocked.status === "participation-blocked") assert.equal(blocked.released, true);
    assert.equal(blockedState.claims.has(eventId), false, "participation blocks safely release the claim");

    const failedLookupState = createStore();
    const lookupError = new Error("lookup unavailable");
    const failedLookup = await startClaimedEventDeletion(eventId, [], {
        store: failedLookupState.store,
        token: "preflight-claim",
        policyDependencies: {
            hasActiveEventRsvp: async () => {
                throw lookupError;
            },
            hasEventInvitation: async () => false,
            hasActiveOccurrenceRsvp: async () => false,
            hasOccurrenceInvitation: async () => false,
        },
    });
    assert.equal(failedLookup.status, "preflight-failed");
    if (failedLookup.status === "preflight-failed") {
        assert.equal(failedLookup.error, lookupError);
        assert.equal(failedLookup.released, true);
    }
    assert.equal(failedLookupState.claims.has(eventId), false, "read-only failures safely release the claim");

    assert.equal(
        await deleteEventRecordWithClaim(eventId, "wrong-token", async (id, token) => {
            if (token !== "right-token") return false;
            state.deleted.set(id, token);
            return true;
        }),
        false,
    );
    assert.equal(state.deleted.has(eventId), false, "source deletion rejects a mismatched claim token");
    assert.equal(
        await deleteEventRecordWithClaim(eventId, "right-token", async (id, token) => {
            if (token !== "right-token") return false;
            state.deleted.set(id, token);
            return true;
        }),
        true,
    );
    assert.equal(state.deleted.get(eventId), "right-token", "source deletion requires the matching token");

    assert.equal(shouldReleaseEventDeletionClaim("pre-destructive"), true);
    assert.equal(shouldReleaseEventDeletionClaim("participation-blocked"), true);
    assert.equal(
        shouldReleaseEventDeletionClaim(claimFailureKindAfterEligibility(undefined)),
        false,
        "ambiguous destructive failures retain the deletion claim",
    );

    console.log("event deletion claim tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

import assert from "node:assert/strict";
import {
    buildEventDeletionFilters,
    evaluateEventDeletionEligibility,
    isDeletableEventStage,
    type EventDeletionPolicyDependencies,
} from "./event-deletion-policy";

const eventId = "507f1f77bcf86cd799439011";

const dependencies = (overrides: Partial<EventDeletionPolicyDependencies> = {}): EventDeletionPolicyDependencies => ({
    hasActiveEventRsvp: async () => false,
    hasEventInvitation: async () => false,
    hasActiveOccurrenceRsvp: async () => false,
    hasOccurrenceInvitation: async () => false,
    ...overrides,
});

async function main() {
    assert.equal(isDeletableEventStage("draft"), true);
    assert.equal(isDeletableEventStage("open"), true);
    assert.equal(isDeletableEventStage("review"), false);
    assert.equal(isDeletableEventStage("cancelled"), false);

    for (const stage of ["draft", "open"] as const) {
        assert.deepEqual(await evaluateEventDeletionEligibility(eventId, [], stage, dependencies()), {
            allowed: true,
            blockers: [],
        });
    }

    for (const [overrides, blocker] of [
        [{ hasActiveEventRsvp: async () => true }, "event-rsvps"],
        [{ hasEventInvitation: async () => true }, "event-invitations"],
        [{ hasActiveOccurrenceRsvp: async () => true }, "occurrence-rsvps"],
        [{ hasOccurrenceInvitation: async () => true }, "occurrence-invitations"],
    ] as const) {
        const result = await evaluateEventDeletionEligibility(eventId, [], "open", dependencies(overrides));
        assert.equal(result.allowed, false);
        if (!result.allowed) assert.deepEqual(result.blockers, [blocker]);
    }

    assert.deepEqual(await evaluateEventDeletionEligibility(eventId, ["did:legacy:invitee"], "open", dependencies()), {
        allowed: false,
        blockers: ["legacy-invitations"],
    });
    assert.deepEqual(await evaluateEventDeletionEligibility(eventId, [], "cancelled", dependencies()), {
        allowed: false,
        blockers: ["stage"],
    });

    assert.deepEqual(buildEventDeletionFilters(eventId), {
        eventRsvp: { eventId, status: { $in: ["going", "interested", "waitlist"] } },
        eventInvitation: { eventId },
        occurrenceRsvp: { seriesId: eventId, status: { $in: ["going", "interested"] } },
        occurrenceInvitation: { seriesId: eventId },
    });

    console.log("event deletion policy tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

import assert from "node:assert/strict";
import {
    buildEventDeletionFilters,
    evaluateEventDeletionEligibility,
    evaluateEventDeletionEligibilityForAction,
    shouldRunOrdinaryEventCancellation,
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
    assert.deepEqual(
        buildEventDeletionFilters(eventId),
        {
            eventRsvp: { eventId, status: { $in: ["going", "interested", "waitlist"] } },
            eventInvitation: { eventId },
            occurrenceRsvp: { seriesId: eventId, status: { $in: ["going", "interested"] } },
            occurrenceInvitation: { seriesId: eventId },
        },
        "filters block active participation while allowing inactive records to be cleaned up",
    );

    const checks: string[] = [];
    assert.deepEqual(
        await evaluateEventDeletionEligibility(
            eventId,
            [],
            dependencies({
                hasActiveEventRsvp: async (id) => {
                    checks.push(`event-rsvp:${id}`);
                    return false;
                },
                hasEventInvitation: async (id) => {
                    checks.push(`event-invitation:${id}`);
                    return false;
                },
                hasActiveOccurrenceRsvp: async (id) => {
                    checks.push(`occurrence-rsvp:${id}`);
                    return false;
                },
                hasOccurrenceInvitation: async (id) => {
                    checks.push(`occurrence-invitation:${id}`);
                    return false;
                },
            }),
        ),
        { allowed: true, blockers: [] },
        "events without participation are deletable",
    );
    assert.equal(checks.length, 4, "both event-level and occurrence-level records are checked");
    assert.ok(
        checks.every((entry) => entry.endsWith(`:${eventId}`)),
        "all checks use the canonical event id",
    );

    const cases = [
        ["event-rsvps", { hasActiveEventRsvp: async () => true }],
        ["event-invitations", { hasEventInvitation: async () => true }],
        ["occurrence-rsvps", { hasActiveOccurrenceRsvp: async () => true }],
        ["occurrence-invitations", { hasOccurrenceInvitation: async () => true }],
    ] as const;
    for (const [blocker, override] of cases) {
        assert.deepEqual(
            await evaluateEventDeletionEligibility(eventId, [], dependencies(override)),
            { allowed: false, blockers: [blocker] },
            `${blocker} blocks deletion`,
        );
    }

    assert.deepEqual(
        await evaluateEventDeletionEligibility(eventId, ["did:example:legacy"], dependencies()),
        { allowed: false, blockers: ["legacy-invitations"] },
        "legacy embedded invitations block deletion",
    );

    assert.equal(shouldRunOrdinaryEventCancellation("blocked"), true);
    assert.equal(shouldRunOrdinaryEventCancellation("preflight-failed"), true);
    assert.equal(shouldRunOrdinaryEventCancellation("failed"), false);
    assert.equal(shouldRunOrdinaryEventCancellation("deleted-cleanup-incomplete"), false);

    const lookupError = new Error("eligibility lookup unavailable");
    const failedLookup = await evaluateEventDeletionEligibilityForAction(
        eventId,
        [],
        dependencies({
            hasActiveEventRsvp: async () => {
                throw lookupError;
            },
        }),
    );
    assert.equal(failedLookup.status, "preflight-failed");
    if (failedLookup.status === "preflight-failed") assert.equal(failedLookup.error, lookupError);
    assert.equal(
        shouldRunOrdinaryEventCancellation(failedLookup.status),
        true,
        "a throwing eligibility lookup allows ordinary cancellation",
    );

    console.log("event deletion policy tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

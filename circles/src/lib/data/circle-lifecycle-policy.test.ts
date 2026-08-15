import assert from "node:assert/strict";
import {
    canDiscoverCircleByLifecycle,
    canReadCircleByLifecycle,
    canWriteCircleByLifecycle,
    getCircleModerationStatus,
    assertCircleWritesAllowed,
} from "./circle-lifecycle-policy";

assert.equal(getCircleModerationStatus({}), "active", "legacy circles default to active");

for (const status of [undefined, "active"] as const) {
    const circle = status ? { moderationStatus: status } : {};
    assert.equal(canReadCircleByLifecycle(circle), true);
    assert.equal(canWriteCircleByLifecycle(circle), true);
    assert.equal(canDiscoverCircleByLifecycle(circle), true);
}

assert.equal(canReadCircleByLifecycle({ moderationStatus: "paused" }), true);
assert.equal(canWriteCircleByLifecycle({ moderationStatus: "paused" }), false);
assert.equal(canDiscoverCircleByLifecycle({ moderationStatus: "paused" }), true);

for (const moderationStatus of ["paused", "suspended", "removed"] as const) {
    const userCircle = { circleType: "user" as const, moderationStatus };
    assert.equal(canReadCircleByLifecycle(userCircle), true, `user profile remains readable when ${moderationStatus}`);
    assert.equal(canWriteCircleByLifecycle(userCircle), true, `user profile remains writable when ${moderationStatus}`);
    assert.equal(
        canDiscoverCircleByLifecycle(userCircle),
        true,
        `user profile remains discoverable when ${moderationStatus}`,
    );
}

for (const moderationStatus of ["suspended", "removed"] as const) {
    const circle = { moderationStatus };
    assert.equal(canReadCircleByLifecycle(circle), false);
    assert.equal(canWriteCircleByLifecycle(circle), false);
    assert.equal(canDiscoverCircleByLifecycle(circle), false);
}

const run = async () => {
    await assertCircleWritesAllowed({ circleType: "circle", moderationStatus: "active" });
    await assertCircleWritesAllowed({ circleType: "user", moderationStatus: "suspended" });
    for (const moderationStatus of ["paused", "suspended", "removed"] as const) {
        await assert.rejects(
            assertCircleWritesAllowed({ circleType: "circle", moderationStatus }),
            /unavailable/,
            `${moderationStatus} circle writes are rejected`,
        );
        await assertCircleWritesAllowed({ circleType: "user", moderationStatus });
    }

    console.log("circle lifecycle policy tests passed");
};

void run();

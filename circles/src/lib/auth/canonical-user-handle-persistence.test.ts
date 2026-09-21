import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import type { Circle, UserPrivate } from "@/models/models";

const originalAppDir = process.env.APP_DIR;
const originalIsBuild = process.env.IS_BUILD;
const testAppDir = `/tmp/circles-invalid-signup-${process.pid}-${Date.now()}`;
process.env.APP_DIR = testAppDir;
process.env.IS_BUILD = "true";

const productionModules = Promise.all([import("../data/circle"), import("../data/user"), import("./auth")]);

const id = new ObjectId().toHexString();
const historicalHandle = "Tall-Tim";
const did = "did:test-user";

const existingUser = (overrides: Partial<Circle> = {}): Circle =>
    ({
        _id: new ObjectId(id),
        did,
        name: "Historical User",
        handle: historicalHandle,
        circleType: "user",
        ...overrides,
    }) as Circle;

type PersistenceCalls = {
    finds: Record<string, unknown>[];
    updates: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }>;
};

async function main() {
    const [{ createCircle, updateCircle }, { createNewUser, updateUser }, { createUserAccount }] =
        await productionModules;

    function circleHarness(options: { conflict?: Circle } = {}) {
        const calls: PersistenceCalls = { finds: [], updates: [] };
        const current = existingUser();
        return {
            calls,
            dependencies: {
                getCircleById: async () => current,
                assertCircleWritesAllowed: async () => undefined,
                findCircleByHandle: async (filter: Record<string, unknown>) => {
                    calls.finds.push(filter);
                    return options.conflict ?? null;
                },
                updateCircleRecord: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
                    calls.updates.push({ filter, update });
                    return { matchedCount: 1 };
                },
                upsertVbdCircles: async () => ({ eligibleCount: 0, skippedCount: 0 }),
                getChatRoomByHandle: async () => null,
                updateChatRoom: async () => undefined,
            },
        };
    }

    function userHarness(options: { conflict?: Circle } = {}) {
        const calls: PersistenceCalls = { finds: [], updates: [] };
        const current = existingUser();
        return {
            calls,
            dependencies: {
                getPrivateUserByDid: async () => current as UserPrivate,
                getCircleById: async () => current,
                findCircleByHandle: async (filter: Record<string, unknown>) => {
                    calls.finds.push(filter);
                    return options.conflict ?? null;
                },
                updateCircleRecord: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
                    calls.updates.push({ filter, update });
                    return { matchedCount: 1 };
                },
            },
        };
    }

    for (const [label, update] of [
        ["omitted", { _id: id, name: "Updated name" }],
        ["undefined", { _id: id, name: "Updated name", handle: undefined }],
    ] as const) {
        const circle = circleHarness();
        await updateCircle(update, did, circle.dependencies);
        assert.equal(circle.calls.updates.length, 1, `updateCircle persists an unrelated ${label}-handle update`);
        assert.equal(
            Object.prototype.hasOwnProperty.call((circle.calls.updates[0].update as any).$set, "handle"),
            false,
            `updateCircle preserves the historical handle when it is ${label}`,
        );
        assert.equal(circle.calls.finds.length, 0, `updateCircle skips uniqueness when handle is ${label}`);

        const user = userHarness();
        await updateUser(update, did, user.dependencies);
        assert.equal(user.calls.updates.length, 1, `updateUser persists an unrelated ${label}-handle update`);
        assert.equal(
            Object.prototype.hasOwnProperty.call((user.calls.updates[0].update as any).$set, "handle"),
            false,
            `updateUser preserves the historical handle when it is ${label}`,
        );
        assert.equal(user.calls.finds.length, 0, `updateUser skips uniqueness when handle is ${label}`);
    }

    for (const [label, run] of [
        [
            "updateCircle",
            async (handle: unknown, harness: ReturnType<typeof circleHarness>) =>
                updateCircle({ _id: id, handle } as Partial<Circle>, did, harness.dependencies),
        ],
        [
            "updateUser",
            async (handle: unknown, harness: ReturnType<typeof userHarness>) =>
                updateUser({ _id: id, handle } as Partial<UserPrivate>, did, harness.dependencies),
        ],
    ] as const) {
        const unchanged = label === "updateCircle" ? circleHarness() : userHarness();
        await run(historicalHandle, unchanged as any);
        assert.equal(unchanged.calls.updates.length, 1, `${label} accepts an unchanged historical handle`);
        assert.equal(unchanged.calls.finds.length, 0, `${label} does not uniqueness-check an unchanged handle`);

        const changed = label === "updateCircle" ? circleHarness() : userHarness();
        await run("new-handle", changed as any);
        assert.equal(changed.calls.updates.length, 1, `${label} persists a canonical handle change`);
        assert.equal(changed.calls.finds.length, 1, `${label} checks uniqueness for a changed handle`);
        const exclusion = changed.calls.finds[0]._id as { $ne: ObjectId };
        assert.equal(exclusion.$ne.toHexString(), id, `${label} excludes the current document from uniqueness`);

        for (const invalid of [null, "", "Bad Handle", "bad--handle"]) {
            const malformed = label === "updateCircle" ? circleHarness() : userHarness();
            await assert.rejects(run(invalid, malformed as any), /Handle must/i, `${label}: ${invalid}`);
            assert.equal(malformed.calls.updates.length, 0, `${label} never persists malformed handle ${invalid}`);
            assert.equal(malformed.calls.finds.length, 0, `${label} validates before querying handle ${invalid}`);
        }

        const conflict =
            label === "updateCircle"
                ? circleHarness({ conflict: existingUser() })
                : userHarness({ conflict: existingUser() });
        await assert.rejects(run("owned-elsewhere", conflict as any), /already in use/);
        assert.equal(conflict.calls.updates.length, 0, `${label} does not persist a conflicting handle`);
    }

    assert.throws(
        () => createNewUser(did, "public-key", "Name", "Bad Handle"),
        /Handle must/i,
        "the shared Vibe ID/user-record builder rejects malformed handles",
    );
    await assert.rejects(
        createCircle({ name: "Name", handle: "Bad Handle", circleType: "user" } as Circle, did),
        /Handle must/i,
        "generic user-circle creation rejects malformed handles before database access",
    );
    await assert.rejects(
        createUserAccount("Name", "Bad Handle", "user", "test@example.invalid", "password"),
        /Handle must/i,
        "normal signup rejects malformed handles",
    );
    assert.equal(existsSync(testAppDir), false, "invalid normal signup creates no account directory");

    const vibeIdSource = readFileSync("src/lib/auth/vibe-id.ts", "utf8");
    assert.match(
        vibeIdSource,
        /createNewUser\([\s\S]*?handle,[\s\S]*?Circles\.insertOne\(user\)/,
        "Vibe ID persists records returned by the behaviour-tested validated builder",
    );

    console.log("canonical user handle persistence tests passed");
}

main()
    .finally(() => {
        if (originalAppDir === undefined) delete process.env.APP_DIR;
        else process.env.APP_DIR = originalAppDir;
        if (originalIsBuild === undefined) delete process.env.IS_BUILD;
        else process.env.IS_BUILD = originalIsBuild;
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

import assert from "node:assert/strict";
// @ts-expect-error Bun provides its test APIs at runtime.
import { test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";

test.skipIf(process.env.CIRCLE_ABOUT_INTEGRATION_TEST !== "1")(
    "About content round-trips through MongoDB and protects newer edits",
    async () => {
        assert.equal(process.env.NODE_ENV, "test");
        assert.notEqual(process.env.IS_BUILD, "true");
        assert.match(process.env.MONGODB_URI ?? "", /^mongodb:\/\/127\.0\.0\.1:\d+\/?$/);
        assert.match(process.env.CIRCLES_MONGODB_DATABASE ?? "", /^circles_stage1a_test_[a-z0-9_-]+$/i);
        const { Circles, closeDbForTests } = await import("@/lib/data/db");
        const { CircleAboutContentConflictError, getCircleAboutContent, getCircleById, getCircleByHandle, updateCircle } =
            await import("@/lib/data/circle");
        const dependencies = {
            getCircleById,
            assertCircleWritesAllowed: async () => undefined,
            findCircleByHandle: async () => null,
            updateCircleRecord: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
                Circles.updateOne(filter, update),
            upsertVbdCircles: async () => ({ eligibleCount: 0, skippedCount: 0 }),
            getChatRoomByHandle: async () => null,
            updateChatRoom: async () => undefined,
        };
        const ids: ObjectId[] = [];
        try {
            const variants: Partial<Circle>[] = [
                { circleType: "user" },
                { circleType: "circle", circleLevel: "top_level", visibility: "public" },
                { circleType: "circle", parentCircleId: "legacy-parent", visibility: "secret" },
            ];
            for (const variant of variants) {
                const _id = new ObjectId();
                ids.push(_id);
                const id = _id.toHexString();
                const handle = `about-${id}`;
                const did = "did:fixture:about-owner";
                await Circles.insertOne({ _id, handle, did, description: "Short intro", mission: "Purpose", ...variant });

                const historical = "$historical **About**\nSecond line";
                const edited = "**Edited About**\n\n- One\n- Two";
                assert.equal(await getCircleAboutContent(id), undefined);
                await updateCircle({ _id: id, content: historical }, did, dependencies, null);
                assert.equal(await getCircleAboutContent(id), historical);
                assert.equal((await getCircleByHandle(handle)).content, undefined);
                assert.equal((await getCircleById(id)).content, undefined);

                await updateCircle({ _id: id, content: edited }, did, dependencies, historical);
                await updateCircle({ _id: id, description: "Updated introduction" }, did, dependencies);
                await assert.rejects(
                    updateCircle({ _id: id, content: "Stale draft", mission: "Stale mission" }, did, dependencies, historical),
                    CircleAboutContentConflictError,
                );
                assert.equal(await getCircleAboutContent(id), edited);
                assert.equal((await getCircleById(id)).mission, "Purpose");

                const concurrent = await Promise.allSettled([
                    updateCircle({ _id: id, content: "Concurrent edit" }, did, dependencies, edited),
                    updateCircle({ _id: id, content: "" }, did, dependencies, edited),
                ]);
                assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
                const failure = concurrent.find((result) => result.status === "rejected");
                assert.ok(failure?.reason instanceof CircleAboutContentConflictError);
                const current = (await getCircleAboutContent(id))!;
                assert.ok(current === "" || current === "Concurrent edit");
                await updateCircle({ _id: id, content: "" }, did, dependencies, current);
                assert.equal(await getCircleAboutContent(id), "");
                assert.equal((await getCircleById(id)).did, did);
            }

            // Some older records have a BSON null. The editor treats it like a missing value.
            const _id = new ObjectId();
            ids.push(_id);
            await Circles.insertOne({ _id, circleType: "circle", content: null } as unknown as Circle);
            await updateCircle({ _id: _id.toHexString(), content: "Repaired legacy About" }, "did:fixture:editor", dependencies, null);
            assert.equal(await getCircleAboutContent(_id.toHexString()), "Repaired legacy About");
        } finally {
            await Circles.deleteMany({ _id: { $in: ids } });
            await closeDbForTests();
        }
    },
);

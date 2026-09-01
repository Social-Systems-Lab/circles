import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { resolveTaskUpdateOwnership } from "./task-reference-integrity-policy";

type Kind = "outcome" | "shift";
type Visibility = "public" | "secret";

const ZERO_EFFECTS = {
    taskUpdates: 0,
    circleIdWrites: 0,
    uploads: 0,
    imageDeletes: 0,
    commentPostIdWrites: 0,
    noticeboardPostIdWrites: 0,
    postCreates: 0,
    postUpdates: 0,
    postDeletes: 0,
    vectorMutations: 0,
    notifications: 0,
    activity: 0,
    revalidations: 0,
};

const fixture = (
    options: {
        requestedCircleId?: unknown;
        crossCircle?: boolean;
        supplied?: boolean;
        taskId?: unknown;
        loadedId?: unknown;
        storedCircleId?: unknown;
        missingTask?: boolean;
        kind?: Kind;
        sourceVisibility?: Visibility;
        targetVisibility?: Visibility;
        actor?: "member" | "both-admin" | "superadmin";
    } = {},
) => {
    const sourceCircleId = new ObjectId().toHexString();
    const targetCircleId = new ObjectId().toHexString();
    const canonicalTaskId = new ObjectId().toHexString();
    const effects = { ...ZERO_EFFECTS };
    const noticeboardPost = { title: "Public shift", content: "Public details", feedId: "feed-a" };
    const commentPost = { feedId: "feed-a", content: "Task shadow" };
    const task = {
        _id: Object.prototype.hasOwnProperty.call(options, "loadedId") ? options.loadedId : canonicalTaskId,
        circleId: Object.prototype.hasOwnProperty.call(options, "storedCircleId")
            ? options.storedCircleId
            : sourceCircleId,
        taskType: options.kind ?? "outcome",
        title: "Public shift",
        commentPostId: "comment-a",
        noticeboardPostId: "noticeboard-a",
    };
    const requested =
        options.supplied === false
            ? undefined
            : options.crossCircle
              ? targetCircleId
              : (options.requestedCircleId ?? sourceCircleId);
    return {
        sourceCircleId,
        targetCircleId,
        canonicalTaskId,
        effects,
        task,
        noticeboardPost,
        commentPost,
        options,
        run: async () => {
            const resolved = await resolveTaskUpdateOwnership(options.taskId ?? canonicalTaskId, requested, async () =>
                options.missingTask ? null : task,
            );
            if (!resolved) return false;
            effects.taskUpdates++;
            effects.circleIdWrites++;
            task.circleId = resolved.ownership.circleId;
            effects.revalidations++;
            return true;
        },
    };
};

const assertZeroEffects = (effects: typeof ZERO_EFFECTS) => assert.deepEqual(effects, ZERO_EFFECTS);

const main = async () => {
    for (const kind of ["outcome", "shift"] as const) {
        const omitted = fixture({ kind, supplied: false });
        assert.equal(await omitted.run(), true, `${kind}: omitted Circle assertion proceeds`);
        assert.equal(omitted.task.circleId, omitted.sourceCircleId);

        const exact = fixture({ kind });
        assert.equal(await exact.run(), true, `${kind}: exact Circle assertion proceeds`);
        assert.equal(exact.task.circleId, exact.sourceCircleId);

        const uppercase = fixture({ kind });
        uppercase.options.requestedCircleId = uppercase.sourceCircleId.toUpperCase();
        assert.ok(
            await resolveTaskUpdateOwnership(
                uppercase.canonicalTaskId,
                uppercase.sourceCircleId.toUpperCase(),
                async () => uppercase.task,
            ),
            `${kind}: uppercase-equivalent ObjectId proceeds`,
        );
    }

    for (const [sourceVisibility, targetVisibility] of [
        ["public", "public"],
        ["public", "secret"],
        ["secret", "public"],
        ["secret", "secret"],
    ] as const) {
        for (const actor of ["member", "both-admin", "superadmin"] as const) {
            const denied = fixture({ sourceVisibility, targetVisibility, actor, crossCircle: true });
            assert.equal(await denied.run(), false, `${sourceVisibility}->${targetVisibility} is denied for ${actor}`);
            assertZeroEffects(denied.effects);
        }
    }

    for (const [name, options] of [
        ["malformed requested Circle", { requestedCircleId: "not-an-id" }],
        ["empty supplied Circle", { requestedCircleId: "" }],
        ["malformed Task ID", { taskId: "not-an-id" }],
        ["missing Task", { missingTask: true }],
        ["malformed stored Circle", { storedCircleId: "not-an-id" }],
        ["missing stored Circle", { storedCircleId: null }],
        ["wrong loaded identity", { loadedId: new ObjectId().toHexString() }],
    ] as const) {
        const denied = fixture(options);
        assert.equal(await denied.run(), false, name);
        assertZeroEffects(denied.effects);
    }

    // Release-blocking public -> Secret Shift regression: no B-side content can reach A's Post.
    const leak = fixture({
        kind: "shift",
        sourceVisibility: "public",
        targetVisibility: "secret",
        crossCircle: true,
    });
    const originalNoticeboard = { ...leak.noticeboardPost };
    assert.equal(await leak.run(), false);
    assert.equal(leak.task.circleId, leak.sourceCircleId);
    assert.deepEqual(leak.noticeboardPost, originalNoticeboard);
    assert.equal(leak.noticeboardPost.feedId, "feed-a");
    assertZeroEffects(leak.effects);

    // Cross-Circle edits cannot detach the canonical Comment shadow.
    const shadow = fixture({ requestedCircleId: new ObjectId().toHexString() });
    const originalTask = { ...shadow.task };
    const originalComment = { ...shadow.commentPost };
    assert.equal(await shadow.run(), false);
    assert.deepEqual(shadow.task, originalTask);
    assert.deepEqual(shadow.commentPost, originalComment);
    assertZeroEffects(shadow.effects);

    console.log("task reference-integrity policy tests passed");
};

void main();

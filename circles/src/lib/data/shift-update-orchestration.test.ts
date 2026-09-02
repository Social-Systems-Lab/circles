import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { orchestrateShiftUpdate } from "./shift-update-orchestration";

const ZERO_EFFECTS = {
    uploads: 0,
    imageDeletes: 0,
    taskUpdates: 0,
    postUpdates: 0,
    postCreates: 0,
    backlinkWrites: 0,
    revalidations: 0,
};

type Variant =
    | "valid"
    | "absent"
    | "malformed-backlink"
    | "missing-post"
    | "malformed-feed-id"
    | "missing-feed"
    | "malformed-circle-id"
    | "wrong-circle"
    | "community-feed"
    | "wrong-post-type"
    | "wrong-preview-type"
    | "malformed-preview-id"
    | "wrong-task";

const fixture = (variant: Variant = "valid", failPostUpdate = false) => {
    const taskId = new ObjectId();
    const sourceCircleId = new ObjectId();
    const postId = new ObjectId();
    const feedId = new ObjectId();
    const createdPostId = new ObjectId().toHexString();
    const effects = { ...ZERO_EFFECTS };
    const task = {
        _id: taskId,
        noticeboardPostId:
            variant === "absent" ? undefined : variant === "malformed-backlink" ? "bad" : postId.toHexString(),
        title: "Changed Secret shift",
        description: "Changed Secret details",
    };
    const post = {
        _id: postId,
        feedId: variant === "malformed-feed-id" ? "bad" : feedId,
        title: "Public title",
        content: "Public content",
        postType: variant === "wrong-post-type" ? "comment" : "post",
        internalPreviewType: variant === "wrong-preview-type" ? "event" : "task",
        internalPreviewId:
            variant === "malformed-preview-id" ? "bad" : variant === "wrong-task" ? new ObjectId() : taskId,
    };
    const feed = {
        _id: feedId,
        handle: variant === "community-feed" ? "community" : "default",
        circleId:
            variant === "malformed-circle-id" ? "bad" : variant === "wrong-circle" ? new ObjectId() : sourceCircleId,
    };
    let writtenBacklink: string | undefined;
    let postUpdateTarget: string | undefined;
    let createdPost:
        | { feedId: string; postType: "post"; internalPreviewType: "task"; internalPreviewId: string }
        | undefined;

    return {
        effects,
        task,
        post,
        sourceCircleId,
        feedId,
        createdPostId,
        get writtenBacklink() {
            return writtenBacklink;
        },
        get postUpdateTarget() {
            return postUpdateTarget;
        },
        get createdPost() {
            return createdPost;
        },
        run: () =>
            orchestrateShiftUpdate({
                storedNoticeboardPostId: task.noticeboardPostId,
                expectedTaskId: task._id,
                expectedCircleId: sourceCircleId,
                shouldSynchronizeNoticeboard: true,
                findPostById: async () => (variant === "missing-post" ? null : post),
                findFeedById: async () => (variant === "missing-feed" ? null : feed),
                uploadMedia: async () => {
                    effects.uploads++;
                    return ["uploaded-media"];
                },
                deleteOldMedia: async () => {
                    effects.imageDeletes++;
                },
                updateTask: async () => {
                    effects.taskUpdates++;
                    return true;
                },
                synchronizeNoticeboard: async (binding) => {
                    if (binding) {
                        effects.postUpdates++;
                        postUpdateTarget = binding.postId;
                        if (failPostUpdate) throw new Error("operational updatePost failure");
                        post.title = task.title;
                        post.content = task.description;
                        return binding.postId;
                    }

                    effects.postCreates++;
                    createdPost = {
                        feedId: feedId.toHexString(),
                        postType: "post",
                        internalPreviewType: "task",
                        internalPreviewId: taskId.toHexString(),
                    };
                    return createdPostId;
                },
                writeNoticeboardBacklink: async (newPostId) => {
                    effects.backlinkWrites++;
                    writtenBacklink = newPostId;
                },
                revalidate: () => {
                    effects.revalidations++;
                },
            }),
    };
};

const main = async () => {
    for (const variant of [
        "malformed-backlink",
        "missing-post",
        "malformed-feed-id",
        "missing-feed",
        "malformed-circle-id",
        "wrong-circle",
        "community-feed",
        "wrong-post-type",
        "wrong-preview-type",
        "malformed-preview-id",
        "wrong-task",
    ] as const) {
        const denied = fixture(variant);
        const originalPost = { title: denied.post.title, content: denied.post.content };
        const originalBacklink = denied.task.noticeboardPostId;
        assert.deepEqual(await denied.run(), { status: "noticeboard-unavailable" }, variant);
        assert.deepEqual(denied.effects, ZERO_EFFECTS, `${variant}: zero effects`);
        assert.deepEqual({ title: denied.post.title, content: denied.post.content }, originalPost);
        assert.equal(denied.task.noticeboardPostId, originalBacklink);
    }

    // Post-authorization confidentiality regression: Secret Circle B cannot update public Circle A's Post.
    const secretToPublic = fixture("wrong-circle");
    assert.deepEqual(await secretToPublic.run(), { status: "noticeboard-unavailable" });
    assert.deepEqual(secretToPublic.effects, ZERO_EFFECTS);
    assert.equal(secretToPublic.post.title, "Public title");
    assert.equal(secretToPublic.post.content, "Public content");

    // Same Circle/default Feed is insufficient without the exact Task preview binding.
    const unrelatedPost = fixture("wrong-preview-type");
    assert.deepEqual(await unrelatedPost.run(), { status: "noticeboard-unavailable" });
    assert.deepEqual(unrelatedPost.effects, ZERO_EFFECTS);

    // S1 cannot reuse S2's otherwise canonical Shift noticeboard.
    const wrongTask = fixture("wrong-task");
    assert.deepEqual(await wrongTask.run(), { status: "noticeboard-unavailable" });
    assert.deepEqual(wrongTask.effects, ZERO_EFFECTS);

    const valid = fixture();
    assert.deepEqual(await valid.run(), { status: "success" });
    assert.deepEqual(valid.effects, {
        uploads: 1,
        imageDeletes: 1,
        taskUpdates: 1,
        postUpdates: 1,
        postCreates: 0,
        backlinkWrites: 0,
        revalidations: 1,
    });
    assert.equal(valid.postUpdateTarget, valid.task.noticeboardPostId);
    assert.equal(valid.post.title, valid.task.title);
    assert.equal(valid.post.content, valid.task.description);

    const absent = fixture("absent");
    assert.deepEqual(await absent.run(), { status: "success" });
    assert.deepEqual(absent.effects, {
        uploads: 1,
        imageDeletes: 1,
        taskUpdates: 1,
        postUpdates: 0,
        postCreates: 1,
        backlinkWrites: 1,
        revalidations: 1,
    });
    assert.deepEqual(absent.createdPost, {
        feedId: absent.feedId.toHexString(),
        postType: "post",
        internalPreviewType: "task",
        internalPreviewId: absent.task._id.toHexString(),
    });
    assert.equal(absent.writtenBacklink, absent.createdPostId);

    const failedExistingUpdate = fixture("valid", true);
    const failure = await failedExistingUpdate.run();
    assert.equal(failure.status, "noticeboard-sync-failed");
    assert.deepEqual(failedExistingUpdate.effects, {
        uploads: 1,
        imageDeletes: 1,
        taskUpdates: 1,
        postUpdates: 1,
        postCreates: 0,
        backlinkWrites: 0,
        revalidations: 0,
    });
    assert.equal(failedExistingUpdate.task.noticeboardPostId, failedExistingUpdate.postUpdateTarget);

    console.log("shift update orchestration tests passed");
};

void main();

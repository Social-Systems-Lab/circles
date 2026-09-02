import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { resolveShiftNoticeboardBinding } from "./shift-noticeboard-binding-orchestration";

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

const fixture = (variant: Variant = "valid") => {
    const taskId = new ObjectId();
    const circleId = new ObjectId();
    const postId = new ObjectId();
    const feedId = new ObjectId();
    const effects = { ...ZERO_EFFECTS };
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
        circleId: variant === "malformed-circle-id" ? "bad" : variant === "wrong-circle" ? new ObjectId() : circleId,
    };
    const backlink = variant === "malformed-backlink" ? "bad" : postId.toHexString();
    return {
        effects,
        post,
        backlink,
        taskId,
        circleId,
        run: async () => {
            const binding = await resolveShiftNoticeboardBinding({
                storedNoticeboardPostId: backlink,
                expectedTaskId: taskId,
                expectedCircleId: circleId,
                findPostById: async () => (variant === "missing-post" ? null : post),
                findFeedById: async () => (variant === "missing-feed" ? null : feed),
            });
            if (!binding) return false;
            effects.uploads++;
            effects.imageDeletes++;
            effects.taskUpdates++;
            effects.postUpdates++;
            post.title = "Secret shift";
            post.content = "Secret details";
            effects.revalidations++;
            return true;
        },
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
        const original = { title: denied.post.title, content: denied.post.content };
        assert.equal(await denied.run(), false, variant);
        assert.deepEqual(denied.effects, ZERO_EFFECTS, `${variant}: zero mutation effects`);
        assert.deepEqual({ title: denied.post.title, content: denied.post.content }, original);
        assert.equal(denied.backlink.length > 0, true, `${variant}: suspicious backlink preserved`);
    }

    const valid = fixture();
    assert.equal(await valid.run(), true);
    assert.equal(valid.effects.postUpdates, 1);
    assert.equal(valid.effects.postCreates, 0);
    assert.equal(valid.effects.backlinkWrites, 0);
    assert.equal(valid.post.title, "Secret shift");

    // Primary confidentiality regression: B's Secret Shift cannot update A's public Post.
    const secretToPublic = fixture("wrong-circle");
    assert.equal(await secretToPublic.run(), false);
    assert.deepEqual(secretToPublic.effects, ZERO_EFFECTS);
    assert.equal(secretToPublic.post.title, "Public title");
    assert.equal(secretToPublic.post.content, "Public content");

    console.log("shift noticeboard binding orchestration tests passed");
};

void main();

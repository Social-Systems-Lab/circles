import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const actions = fs.readFileSync(path.join(process.cwd(), "src/app/circles/[handle]/events/actions.ts"), "utf8");
const updateSeam = fs.readFileSync(path.join(process.cwd(), "src/lib/data/event-update-orchestration.ts"), "utf8");
const cleanupSeam = fs.readFileSync(
    path.join(process.cwd(), "src/lib/data/event-noticeboard-cleanup-orchestration.ts"),
    "utf8",
);
const lifecycleSeam = fs.readFileSync(
    path.join(process.cwd(), "src/lib/data/event-destructive-lifecycle-orchestration.ts"),
    "utf8",
);

const section = (startText: string, endText: string) => {
    const start = actions.indexOf(startText);
    const end = actions.indexOf(endText, start + startText.length);
    assert.ok(start >= 0, `${startText} marker exists`);
    assert.ok(end >= 0, `${endText} marker exists`);
    assert.ok(start < end, `${startText} section is well scoped`);
    return actions.slice(start, end);
};

const update = section("export async function updateEventAction", "export async function deleteEventAction");
for (const marker of [
    "getAuthenticatedUserDid(",
    "getEventById(",
    "isRouteCircleEventHost(",
    "canManageEvent(",
    "validateHostCirclePermissions(",
    "orchestrateEventUpdate({",
    "cleanupEventNoticeboardPosts(event)",
]) {
    assert.ok(update.indexOf(marker) >= 0, `update path contains ${marker}`);
}
assert.ok(update.indexOf("canManageEvent(") < update.indexOf("cleanupEventNoticeboardPosts(event)"));
assert.ok(update.indexOf("validateHostCirclePermissions(") < update.indexOf("orchestrateEventUpdate({"));
const updateDraft = update.indexOf('if (updateData.stage === "draft")');
const updateDraftLifecycle = update.indexOf("orchestrateEventDestructiveLifecycle({", updateDraft);
for (const marker of [updateDraft, updateDraftLifecycle])
    assert.ok(marker >= 0, "update draft lifecycle marker exists");
assert.ok(updateDraft < updateDraftLifecycle, "updateEventAction draft uses the lifecycle seam");

const resolver = cleanupSeam.indexOf("resolveEventNoticeboardBindings({");
const resolverTry = cleanupSeam.lastIndexOf("try {", resolver);
const resolverGate = cleanupSeam.indexOf("if (!resolved) return noticeboardUnavailable();", resolver);
const resolverCatch = cleanupSeam.indexOf("} catch {", resolverGate);
const targetSelection = cleanupSeam.indexOf("targets = Object.values(context.entriesByCircleId)");
const deletion = cleanupSeam.indexOf("await deleteValidatedPost(target.postId)");
for (const [name, marker] of [
    ["resolver try", resolverTry],
    ["resolver", resolver],
    ["resolver gate", resolverGate],
    ["resolver catch", resolverCatch],
    ["validated target selection", targetSelection],
    ["validated deletion", deletion],
] as const) {
    assert.ok(marker >= 0, `${name} marker exists`);
}
assert.ok(
    resolverTry < resolver && resolver < resolverGate && resolverGate < targetSelection && targetSelection < resolverCatch && resolverCatch < deletion,
    "resolver and complete target setup are caught before deletion",
);
assert.equal(cleanupSeam.includes("noticeboardPostId)" + ";\n            await deleteValidatedPost"), false);
assert.equal(cleanupSeam.includes("Promise.allSettled"), false);
const mediaHelper = updateSeam.indexOf("deleteEventMediaWithFailurePropagation");
const mediaSettled = updateSeam.indexOf("Promise.allSettled", mediaHelper);
const mediaRejected = updateSeam.indexOf('result.status === "rejected"', mediaSettled);
const mediaThrow = updateSeam.indexOf("throw rejected.reason", mediaRejected);
for (const marker of [mediaHelper, mediaSettled, mediaRejected, mediaThrow]) assert.ok(marker >= 0);
assert.ok(mediaHelper < mediaSettled && mediaSettled < mediaRejected && mediaRejected < mediaThrow);
assert.ok(
    update.includes("deleteEventMediaWithFailurePropagation(") && update.includes("deleteOldMedia: deleteOldEventMedia"),
    "production update path passes the fail-propagating media helper into orchestration",
);

const updateCleanup = updateSeam.indexOf("orchestrateEventNoticeboardCleanup({");
const updateMedia = updateSeam.indexOf("await uploadMedia()", updateCleanup);
for (const marker of [updateCleanup, updateMedia])
    assert.ok(marker >= 0, "update ordering marker exists");
assert.ok(
    updateCleanup < updateMedia,
    "preflight and cleanup precede update effects",
);

const lifecycleCleanup = lifecycleSeam.indexOf("await cleanupNoticeboards()");
const lifecycleCleanupGate = lifecycleSeam.indexOf('cleanup.status === "partial-cleanup-failed"');
const lifecyclePrepare = lifecycleSeam.indexOf("await prepare()");
const lifecycleSource = lifecycleSeam.indexOf("await mutateSource(prepared)");
const lifecycleSourcePossible = lifecycleSeam.indexOf("sourceMutationPossible: true", lifecycleSource);
const lifecycleBacklinks = lifecycleSeam.indexOf("await clearBacklinks()");
for (const marker of [lifecycleCleanup, lifecycleCleanupGate, lifecyclePrepare, lifecycleSource, lifecycleSourcePossible, lifecycleBacklinks]) {
    assert.ok(marker >= 0, "destructive lifecycle marker exists");
}
assert.ok(
    lifecycleCleanup < lifecycleCleanupGate &&
        lifecycleCleanupGate < lifecyclePrepare &&
        lifecyclePrepare < lifecycleSource &&
        lifecycleSource < lifecycleBacklinks,
    "cleanup success gates media/source effects and backlink clearing",
);
assert.ok(lifecycleSource < lifecycleSourcePossible, "a throwing invoked source is represented as possibly mutated");
assert.ok(actions.includes("if (result.sourceMutationPossible)"), "action wording uses source mutation possibility");

const directDelete = section(
    "export async function deleteEventAction",
    "export async function cancelEventOccurrenceAction",
);
const directCleanup = directDelete.indexOf("cleanupEventNoticeboardPosts(event)");
const imageDelete = directDelete.indexOf("deleteFile(");
const sourceDelete = directDelete.indexOf("deleteEventDb(eventId)");
const directLifecycle = directDelete.indexOf("orchestrateEventDestructiveLifecycle({");
for (const marker of [directLifecycle, directCleanup, imageDelete, sourceDelete]) assert.ok(marker >= 0);
assert.ok(directLifecycle < directCleanup && directCleanup < imageDelete && imageDelete < sourceDelete);

const stage = section(
    "export async function changeEventStageAction",
    "export async function rsvpEventOccurrenceAction",
);
const zeroRsvp = stage.indexOf("activeRsvpCount === 0");
const withdrawalCleanup = stage.indexOf("cleanupEventNoticeboardPosts(event)", zeroRsvp);
const withdrawalDelete = stage.indexOf("deleteEventDb(eventId)", withdrawalCleanup);
const draftGate = stage.indexOf('if (newStage === "draft")');
const draftCleanup = stage.indexOf("cleanupEventNoticeboardPosts(event)", draftGate);
const stageMutation = stage.indexOf("changeEventStageDb(eventId, newStage)", draftCleanup);
const withdrawalLifecycle = stage.lastIndexOf("orchestrateEventDestructiveLifecycle({", withdrawalCleanup);
const draftLifecycle = stage.lastIndexOf("orchestrateEventDestructiveLifecycle({", draftCleanup);
for (const marker of [
    zeroRsvp,
    withdrawalLifecycle,
    withdrawalCleanup,
    withdrawalDelete,
    draftGate,
    draftLifecycle,
    draftCleanup,
    stageMutation,
]) {
    assert.ok(marker >= 0, "stage lifecycle marker exists");
}
assert.ok(
    zeroRsvp < withdrawalLifecycle && withdrawalLifecycle < withdrawalCleanup && withdrawalCleanup < withdrawalDelete,
);
assert.ok(draftGate < draftLifecycle && draftLifecycle < draftCleanup && draftCleanup < stageMutation);

assert.equal(actions.includes("removeEventNoticeboardPosts"), false, "raw-ID cleanup helper is removed");
assert.equal(
    actions.includes("Promise.allSettled(uniqueNoticeboardPostIds"),
    false,
    "cleanup failure suppression is removed",
);
assert.ok(actions.includes("deleteValidatedPost: (postId) => deletePost(postId)"));
assert.equal(
    /deletePost\(\s*event\.noticeboardPostId/.test(actions),
    false,
    "primary raw ID is never deleted directly",
);
assert.equal(
    /deletePost\(\s*event\.noticeboardPostIdsByCircleId/.test(actions),
    false,
    "map raw IDs are never deleted directly",
);

console.log("event noticeboard destructive call graph tests passed");

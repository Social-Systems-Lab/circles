import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const actions = fs.readFileSync(path.join(process.cwd(), "src/app/circles/[handle]/events/actions.ts"), "utf8");
const updateStart = actions.indexOf("export async function updateEventAction");
const updateEnd = actions.indexOf("export async function deleteEventAction");
assert.ok(updateStart >= 0, "updateEventAction boundary exists");
assert.ok(updateEnd >= 0, "deleteEventAction boundary exists");
assert.ok(updateStart < updateEnd, "updateEventAction is well scoped");
const update = actions.slice(updateStart, updateEnd);
const auth = update.indexOf("getAuthenticatedUserDid(");
const eventLoad = update.indexOf("getEventById(");
const routeHostAssertion = update.indexOf("isRouteCircleEventHost(");
const managementAuthorization = update.indexOf("canManageEvent(");
const formValidation = update.indexOf("updateEventSchema.safeParse(");
const hostAuthorization = update.indexOf("validateHostCirclePermissions(");
const requestedPublicationDecision = update.indexOf(
    "const noticeboardPublicationRequested = shouldPublishToNoticeboard(formData);",
);
const storedReferenceDecision = update.indexOf(
    "const hasStoredNoticeboardState = hasStoredEventNoticeboardReferences(event);",
);
const sharedOrchestrationDecision = update.indexOf(
    "const shouldOrchestrateNoticeboardUpdate = shouldOrchestrateEventNoticeboardUpdate({",
);
const draftBranch = update.indexOf('if (updateData.stage === "draft") {');
const mandatoryOrchestrationBranch = update.indexOf(
    "} else if (shouldOrchestrateNoticeboardUpdate) {",
);
const orchestration = update.indexOf("orchestrateEventUpdate({");
for (const [name, marker] of [
    ["authentication", auth],
    ["canonical Event load", eventLoad],
    ["route-host assertion", routeHostAssertion],
    ["Event management authorization", managementAuthorization],
    ["general form validation", formValidation],
    ["requested-host authorization", hostAuthorization],
    ["client publication intent", requestedPublicationDecision],
    ["canonical stored-reference decision", storedReferenceDecision],
    ["shared production orchestration decision", sharedOrchestrationDecision],
    ["draft branch", draftBranch],
    ["mandatory noticeboard orchestration branch", mandatoryOrchestrationBranch],
    ["Event update orchestration", orchestration],
] as const) {
    assert.ok(marker >= 0, `${name} marker exists`);
}
assert.ok(
    auth < eventLoad &&
        eventLoad < routeHostAssertion &&
        routeHostAssertion < managementAuthorization &&
        managementAuthorization < formValidation &&
        formValidation < hostAuthorization &&
        hostAuthorization < requestedPublicationDecision &&
        requestedPublicationDecision < storedReferenceDecision &&
        storedReferenceDecision < sharedOrchestrationDecision &&
        sharedOrchestrationDecision < draftBranch &&
        draftBranch < mandatoryOrchestrationBranch &&
        mandatoryOrchestrationBranch < orchestration,
    "authentication, Event authorization, form validation, and host authorization precede orchestration",
);
const seam = fs.readFileSync(path.join(process.cwd(), "src/lib/data/event-update-orchestration.ts"), "utf8");
const resolver = seam.indexOf("resolveEventNoticeboardBindings({");
const upload = seam.indexOf("uploadMedia()");
const eventMutation = seam.indexOf("updateEvent(media)");
const postSynchronization = seam.indexOf("synchronizeHost(hostCircleId, binding)");
for (const [name, marker] of [
    ["Event noticeboard resolver", resolver],
    ["media upload effect", upload],
    ["Event update effect", eventMutation],
    ["Post synchronization effect", postSynchronization],
] as const) {
    assert.ok(marker >= 0, `${name} marker exists`);
}
assert.ok(resolver < upload, "preflight precedes media");
assert.ok(resolver < eventMutation, "preflight precedes Event mutation");
assert.ok(resolver < postSynchronization, "preflight precedes Post synchronization");
assert.equal(seam.includes("deletePost"), false, "b2b1 seam has no Post deletion");
const publishedBranchStart = mandatoryOrchestrationBranch;
const publishedBranchEnd = update.indexOf("} else {", publishedBranchStart);
assert.ok(publishedBranchStart >= 0, "published b2b1 update branch exists");
assert.ok(publishedBranchEnd >= 0, "published b2b1 update branch end exists");
assert.ok(publishedBranchStart < publishedBranchEnd, "published b2b1 update branch is well scoped");
const publishedBranch = update.slice(publishedBranchStart, publishedBranchEnd);
assert.equal(publishedBranch.includes("deletePost("), false, "published b2b1 update branch has no Post deletion");
assert.ok(publishedBranch.includes("noticeboardPostId: binding?.postId"), "retained update uses validated binding ID");
assert.ok(
    publishedBranch.includes("noticeboardPublicationRequested,"),
    "client unpublish intent reaches the post-preflight fail-closed seam",
);
assert.ok(
    actions.includes("shouldOrchestrateEventNoticeboardUpdate,"),
    "production action imports the shared orchestration decision",
);
const branchDecisionSetup = update.slice(requestedPublicationDecision, draftBranch);
assert.equal(
    branchDecisionSetup.includes("Boolean(event.noticeboardPostId)"),
    false,
    "stored-state branch decision does not use primary truthiness",
);
assert.equal(
    branchDecisionSetup.includes("Object.keys(event.noticeboardPostIdsByCircleId"),
    false,
    "stored-state branch decision does not use an inline map-entry count",
);
assert.equal(
    update.includes("noticeboardPublicationRequested || hasStoredNoticeboardState"),
    false,
    "production action does not retain a duplicated inline orchestration decision",
);
assert.equal(
    update.includes("} else if (shouldPublishToNoticeboard(formData)) {"),
    false,
    "client checkbox alone cannot gate stored-reference preflight",
);
const plainUpdateBranch = update.slice(publishedBranchEnd);
assert.equal(
    plainUpdateBranch.includes("hasStoredNoticeboardState"),
    false,
    "plain update is reachable only after the stored-state orchestration condition is false",
);
const resolverComplete = seam.indexOf('if (!context) return { status: "noticeboard-unavailable" };');
const explicitUnpublishDenial = seam.indexOf(
    'if (!noticeboardPublicationRequested) return { status: "noticeboard-unavailable" };',
);
const hostRemovalDenial = seam.indexOf("context.existingHostCircleIds.some((id) => !requested.has(id))");
for (const [name, marker] of [
    ["complete resolver result check", resolverComplete],
    ["explicit unpublish denial", explicitUnpublishDenial],
    ["host-removal denial", hostRemovalDenial],
] as const) {
    assert.ok(marker >= 0, `${name} marker exists`);
}
assert.ok(
    resolver < resolverComplete && resolverComplete < explicitUnpublishDenial && explicitUnpublishDenial < upload,
    "stored references are completely preflighted before explicit unpublish fails without effects",
);
assert.ok(
    resolverComplete < hostRemovalDenial && hostRemovalDenial < upload && upload < eventMutation,
    "complete preflight precedes host-removal denial, media upload, and Event mutation",
);
assert.ok(
    update.includes(
        "Event updated, but Noticeboard synchronization did not complete; some Noticeboard posts may already have been updated.",
    ),
    "partial synchronization warning acknowledges the Event update and possible retained-Post effects",
);
assert.equal(
    update.includes("Event updated, but Noticeboard post could not be created."),
    false,
    "sync failure is not misreported as a creation failure",
);

const upsertStart = actions.indexOf("const upsertEventNoticeboardPost");
const upsertEnd = actions.indexOf("const upsertEventNoticeboardPosts", upsertStart);
assert.ok(upsertStart >= 0, "single-host upsert helper exists");
assert.ok(upsertEnd >= 0, "single-host upsert helper end exists");
assert.ok(upsertStart < upsertEnd, "single-host upsert helper is well scoped");
const upsert = actions.slice(upsertStart, upsertEnd);
const existingBindingBranch = upsert.indexOf("if (noticeboardPostId) {");
const retainedUpdate = upsert.indexOf("await updatePost({", existingBindingBranch);
const retainedReturn = upsert.indexOf("return noticeboardPostId;", retainedUpdate);
const createFallback = upsert.indexOf("createPost(");
for (const [name, marker] of [
    ["existing binding branch", existingBindingBranch],
    ["retained Post update", retainedUpdate],
    ["retained Post ID return", retainedReturn],
    ["absent binding Post creation", createFallback],
] as const) {
    assert.ok(marker >= 0, `${name} marker exists`);
}
assert.ok(
    existingBindingBranch < retainedUpdate && retainedUpdate < retainedReturn && retainedReturn < createFallback,
    "validated existing binding updates and returns before the absent-binding create branch",
);
assert.equal(
    upsert.includes("noticeboardPostIdsByCircleId"),
    false,
    "raw stored map is not read by Post upsert helper",
);
assert.equal(
    upsert.slice(existingBindingBranch, createFallback).includes("catch"),
    false,
    "validated update cannot fall through to creation",
);
console.log("event noticeboard update call graph tests passed");

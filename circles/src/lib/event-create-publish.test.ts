import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEventSubmitStage, resolveEventCreationCapability } from "@/lib/event-publish-capability";

const firstCircleId = "507f1f77bcf86cd799439011";
const secondCircleId = "507f191e810c19729de860ea";
const publishableHosts = [
    { _id: firstCircleId, canCreateEvents: true, canPublishEvents: true },
    { _id: secondCircleId, canCreateEvents: true, canPublishEvents: true },
];

assert.equal(resolveEventCreationCapability([], publishableHosts), "unavailable", "no selected host is unavailable");
assert.equal(
    resolveEventCreationCapability([firstCircleId, secondCircleId], publishableHosts),
    "draft-or-publish",
    "all selected publishable hosts permit draft or direct publication",
);
assert.equal(
    resolveEventCreationCapability(
        [firstCircleId, secondCircleId],
        [
            { _id: firstCircleId, canCreateEvents: true, canPublishEvents: true },
            { _id: secondCircleId, canCreateEvents: true, canPublishEvents: false },
        ],
    ),
    "draft-or-review",
    "mixed publish capability permits draft or review",
);
assert.equal(
    resolveEventCreationCapability(
        [firstCircleId, secondCircleId],
        [
            { _id: firstCircleId, canCreateEvents: true, canPublishEvents: true },
            { _id: secondCircleId, canCreateEvents: false, canPublishEvents: false },
        ],
    ),
    "unavailable",
    "a non-creatable selected host is unavailable",
);
assert.equal(
    resolveEventCreationCapability([firstCircleId, secondCircleId], [publishableHosts[0]]),
    "unavailable",
    "an unknown selected host is unavailable",
);
assert.equal(parseEventSubmitStage("review"), "review", "review is a recognized submit stage");
assert.equal(parseEventSubmitStage("draft"), "draft", "draft creation remains unchanged");
assert.equal(parseEventSubmitStage("open"), "open", "open creation remains unchanged");
assert.equal(parseEventSubmitStage("unexpected"), "draft", "unknown submit stages safely fall back to draft");
assert.equal(parseEventSubmitStage(null), "draft", "a missing submit stage safely falls back to draft");

const formSource = readFileSync("src/components/modules/events/event-form.tsx", "utf8");
assert.match(formSource, /Save as draft/, "the creation form retains Save as draft");
assert.match(
    formSource,
    /canDirectPublish[\s\S]*?>\s*\{isPending \? "Saving\.\.\." : "Publish"\}/,
    "the form can render Publish",
);
assert.match(formSource, /onClick=\{\(\) => submitEvent\("draft"\)\}/, "Save as draft submits draft");
assert.match(formSource, /onClick=\{\(\) => submitEvent\("review"\)\}/, "Submit for review submits review");
assert.match(formSource, /onClick=\{\(\) => submitEvent\("open"\)\}/, "Publish submits open");
assert.match(formSource, /submitEvent\("preserve"\)/, "edit-form preserve behavior remains available");
assert.match(
    formSource,
    /const creationCapability = event[\s\S]*?: resolveEventCreationCapability/,
    "editing retains its static capability while creation uses selected-host capabilities",
);

const popupSource = readFileSync("src/components/global-create/create-event-dialog.tsx", "utf8");
assert.match(popupSource, /<EventForm showCirclePicker \/>/, "the global popup uses the capability-aware form");

const createPageSource = readFileSync("src/app/circles/[handle]/events/create/page.tsx", "utf8");
assert.match(createPageSource, /<EventForm[\s\S]*?initialSelectedCircleId=/, "full-page creation still uses EventForm");

const actionsSource = readFileSync("src/app/circles/[handle]/events/actions.ts", "utf8");
assert.match(actionsSource, /canCreateEvents: canCreate/, "host options expose create permission");
assert.match(
    actionsSource,
    /canPublishEvents: canReview \|\| canModerate/,
    "host capabilities reuse review or moderate permission",
);
assert.match(
    actionsSource,
    /existingEvent[\s\S]*?: canCreate,/,
    "new-event hosting requires create permission in every selected circle",
);
assert.match(
    actionsSource,
    /requestedStage !== "open" \|\| canManage/,
    "review creation does not require publish permission while open creation still does",
);
assert.match(actionsSource, /requestedStage === "review"[\s\S]*?"review"/, "review creation stores review stage");
assert.match(
    actionsSource,
    /created\.stage === "review"[\s\S]*?notifyEventSubmittedForReview/,
    "review creation reuses the existing reviewer notification helper",
);
assert.match(actionsSource, /created\.stage === "open"/, "Noticeboard publication remains restricted to open events");
assert.match(actionsSource, /Event submitted for review/, "review creation returns a specific success message");
assert.match(
    actionsSource,
    /validateHostCirclePermissions\(userDid, hostCircleIds, requestedStage\)/,
    "server-side multi-host authorization remains authoritative",
);

const notificationSource = readFileSync("src/lib/data/eventNotifications.ts", "utf8");
assert.match(
    notificationSource,
    /getEventCircle\(event\)[\s\S]*?did !== submitter\.did/,
    "the existing helper notifies primary-circle reviewers and excludes the submitter",
);
assert.match(
    notificationSource,
    /try \{[\s\S]*?sendNotifications\([\s\S]*?catch \(err\)/,
    "review notification failure remains non-fatal",
);

console.log("event create publish tests passed");

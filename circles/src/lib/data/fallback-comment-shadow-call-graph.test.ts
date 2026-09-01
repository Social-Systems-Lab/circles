import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const actionFiles = {
    task: "src/app/circles/[handle]/tasks/actions.ts",
    goal: "src/app/circles/[handle]/goals/actions.ts",
    issue: "src/app/circles/[handle]/issues/actions.ts",
    proposal: "src/app/circles/[handle]/proposals/actions.ts",
} as const;

for (const [type, relativePath] of Object.entries(actionFiles)) {
    const text = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
    const match = text.match(
        new RegExp(
            `export async function ensureShadowPostFor${type[0].toUpperCase()}${type.slice(1)}Action[\\s\\S]*?\\n}`,
        ),
    );
    assert.ok(match, `${type} ensure action remains exported`);
    const body = match[0];
    assert.match(body, /getAuthenticatedUserDid\(\)/, `${type} authenticates at its mutation boundary`);
    assert.match(
        body,
        new RegExp(`orchestrateFallbackCommentShadow\\(\"${type}\"`),
        `${type} delegates to shared seam`,
    );
    assert.ok(
        body.indexOf("getAuthenticatedUserDid()") < body.indexOf("orchestrateFallbackCommentShadow"),
        `${type} authenticates before delegation`,
    );
    assert.doesNotMatch(body, /Feeds\.findOne|createPost\(|\.updateOne\(/, `${type} has no direct raw mutation path`);
}

const orchestration = fs.readFileSync(
    path.join(process.cwd(), "src/lib/data/fallback-comment-shadow-orchestration.ts"),
    "utf8",
);
assert.match(orchestration, /handle: "default"/, "canonical default Feed is selected server-side");
assert.match(orchestration, /callerCircleId !== canonicalCircleId/, "route Circle is only a consistency assertion");
assert.match(orchestration, /commentPostId: \{ \$exists: false \}/, "backlink uses a conditional absence predicate");
assert.match(
    orchestration,
    /post\.internalPreviewType === undefined/,
    "strict backlinks reject present internalPreviewType",
);
assert.match(
    orchestration,
    /post\.internalPreviewId === undefined/,
    "strict backlinks reject present internalPreviewId",
);
assert.doesNotMatch(orchestration, /ensureCanonicalEventShadow/, "fallback seam does not absorb Event orchestration");

const event = fs.readFileSync(path.join(process.cwd(), "src/lib/data/event-shadow-orchestration.ts"), "utf8");
assert.match(event, /export async function ensureCanonicalEventShadow/, "Event canonical shadow path is unchanged");

const eventActions = fs.readFileSync(path.join(process.cwd(), "src/app/circles/[handle]/events/actions.ts"), "utf8");
assert.match(
    eventActions,
    /ensureCanonicalEventShadow\(eventId, userDid\)/,
    "Event action keeps its separate canonical seam",
);

const shiftDetail = fs.readFileSync(
    path.join(process.cwd(), "src/app/circles/[handle]/shifts/[shiftId]/page.tsx"),
    "utf8",
);
assert.match(
    shiftDetail,
    /ensureShadowPostForTaskAction\(shiftId, circle\._id as string\)/,
    "Shift routes through Task fallback",
);
assert.doesNotMatch(
    shiftDetail,
    /ensureShadowPostForShift|orchestrateFallbackCommentShadow/,
    "Shift adds no alternate ownership seam",
);

console.log("fallback Comment shadow call-graph guards passed");

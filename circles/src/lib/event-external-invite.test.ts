import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Circle } from "@/models/models";
import {
    EXTERNAL_EVENT_INVITE_ERRORS,
    getExternalEventInviteProfileError,
    resolveExternalEventInviteHandle,
} from "@/lib/event-external-invite";

const userProfile = (overrides: Partial<Circle> = {}): Partial<Circle> => ({
    did: "did:example:target",
    circleType: "user",
    handle: "example-handle",
    name: "Example Handle",
    ...overrides,
});

assert.equal(
    resolveExternalEventInviteHandle("@Example-Handle"),
    "example-handle",
    "exact @handle resolution normalizes case",
);
assert.equal(resolveExternalEventInviteHandle("@ab"), null, "profile handles shorter than 3 characters are rejected");
assert.equal(resolveExternalEventInviteHandle("@abc"), "abc", "3-character profile handles are valid");
assert.equal(
    resolveExternalEventInviteHandle("@abcdefghijklmnopqrst"),
    "abcdefghijklmnopqrst",
    "20-character profile handles are valid",
);
assert.equal(
    resolveExternalEventInviteHandle("@abcdefghijklmnopqrstu"),
    null,
    "profile handles longer than 20 characters are rejected",
);
assert.equal(
    resolveExternalEventInviteHandle("@abc-123"),
    "abc-123",
    "profile handles may contain lowercase letters, numbers, and hyphens",
);
assert.equal(
    resolveExternalEventInviteHandle("https://kamooni.org/circles/example-handle"),
    "example-handle",
    "valid Kamooni profile URLs resolve to handles",
);
assert.equal(
    resolveExternalEventInviteHandle("https://www.kamooni.org/circles/example-handle"),
    "example-handle",
    "valid www Kamooni profile URLs resolve to handles",
);
assert.equal(
    resolveExternalEventInviteHandle("example-handle"),
    "example-handle",
    "bare exact handles resolve when they match handle rules",
);
assert.equal(
    resolveExternalEventInviteHandle("http://kamooni.org/circles/example-handle"),
    null,
    "HTTP Kamooni profile URLs are rejected",
);
assert.equal(
    resolveExternalEventInviteHandle("https://not-kamooni.example/circles/example-handle"),
    null,
    "non-Kamooni URLs are rejected",
);
assert.equal(
    resolveExternalEventInviteHandle("https://kamooni.org/not-a-profile"),
    null,
    "malformed URLs are rejected",
);
assert.equal(resolveExternalEventInviteHandle("@bad_handle"), null, "malformed handles are rejected");

assert.equal(
    getExternalEventInviteProfileError({ target: null }),
    EXTERNAL_EVENT_INVITE_ERRORS.notFound,
    "unknown users return the not-found error",
);
assert.equal(
    getExternalEventInviteProfileError({ target: userProfile({ circleType: "circle" }) }),
    EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite,
    "ordinary circles cannot be invited through the personal-profile flow",
);
assert.equal(
    getExternalEventInviteProfileError({ target: userProfile({ accountStatus: "rejected" }) }),
    EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite,
    "rejected personal profiles cannot be invited",
);
assert.equal(
    getExternalEventInviteProfileError({
        target: userProfile(),
        inviterDid: "did:example:target",
    }),
    EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite,
    "organisers cannot invite their own account",
);
assert.equal(
    getExternalEventInviteProfileError({
        target: userProfile(),
        alreadyInvited: true,
    }),
    EXTERNAL_EVENT_INVITE_ERRORS.duplicate,
    "duplicate invitations are rejected",
);
assert.equal(
    getExternalEventInviteProfileError({
        target: userProfile(),
        alreadyAttending: true,
    }),
    EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite,
    "users already attending are not invited again",
);
assert.equal(
    getExternalEventInviteProfileError({ target: userProfile(), inviterDid: "did:example:organiser" }),
    null,
    "a real personal profile can pass validation",
);
assert.equal(
    EXTERNAL_EVENT_INVITE_ERRORS.unauthorized,
    "You do not have permission to invite people to this event.",
    "unauthorised inviters receive the required error",
);

const actionsSource = readFileSync("src/app/circles/[handle]/events/actions.ts", "utf8");
assert.match(
    actionsSource,
    /canManageEvent\(userDid, event\)/,
    "external invite actions reuse event invitation permission checks",
);
assert.match(
    actionsSource,
    /EventInvitations\.updateOne/,
    "successful external invites use the existing eventInvitations record",
);
assert.match(
    actionsSource,
    /notifyEventInvitation\(resolved\.event, resolved\.inviter, invitedUser\)/,
    "successful external invites create the standard event invitation notification",
);
assert.doesNotMatch(
    actionsSource,
    /inviteExternalUserToEventAction[\s\S]*addMember/,
    "external event invitations do not create circle memberships",
);

const eventDataSource = readFileSync("src/lib/data/event.ts", "utf8");
assert.match(
    eventDataSource,
    /\$gt: \[\{ \$size: "\$userInvDocs" \}, 0\]/,
    "invited users can view private event details through the existing invitation visibility gate",
);

console.log("event external invite tests passed");

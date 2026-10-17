import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Bun provides module types at runtime; this repository does not install them.
import { test } from "bun:test";
import type { Circle } from "@/models/models";
import { getInviteButtonMode } from "./invite-button";

test("InviteButton exposes Secret invites only with server-derived permission and keeps public copy-link invites", () => {
    assert.equal(getInviteButtonMode({ visibility: "secret" } as Circle), null, "Secret renders no Invite UI");
    assert.equal(
        getInviteButtonMode({ visibility: "secret" } as Circle, true),
        "secret",
        "authorized Secret Circle members receive the private invitation UI",
    );
    assert.equal(
        getInviteButtonMode({ visibility: "public" } as Circle),
        "copy-link",
        "public Circles retain the existing copy-link Invite UI",
    );
    assert.equal(
        getInviteButtonMode({ visibility: "public", circleType: "user" } as Circle),
        "copy-link",
        "public profile Circles retain the existing copy-link Invite UI",
    );
});

const source = readFileSync("src/components/modules/home/invite-button.tsx", "utf8");
const sendFlow = source.match(/const sendSecretInvitation = async \(\) => \{[\s\S]*?\n    \};/);
const revokeFlow = source.match(/const revokeInvitation = async \(invitationId: string\) => \{[\s\S]*?\n    \};/);

test("Secret invite modal loads and renders safe pending invitation rows", () => {
    assert.match(source, /isDialogOpen && mode === "secret"[\s\S]*?loadPendingInvitations\(\)/);
    assert.match(source, />Pending invitations</);
    assert.match(source, /recipientAvatarUrl/);
    assert.match(source, /recipientName/);
    assert.match(source, /recipientHandle/);
    assert.match(source, /new Date\(invitation\.invitedAt\)\.toLocaleDateString\(\)/);
    assert.doesNotMatch(source, /tokenHash|rawToken|recipientDid|invitedByDid/);
});

test("revoke disables one row, removes it on success, and restores it with a generic failure", () => {
    assert.ok(revokeFlow);
    assert.match(source, /disabled=\{revokingId === invitation\.invitationId\}/);
    assert.match(revokeFlow[0], /revokeSecretCircleInvitation\(invitationId\)/);
    assert.match(revokeFlow[0], /filter\(\(item\) => item\.invitationId !== invitationId\)/);
    assert.match(revokeFlow[0], /Unable to revoke invitation\./);
    assert.match(revokeFlow[0], /finally[\s\S]*?setRevokingId\(null\)/);
});

test("successful and duplicate invites keep the modal open and refresh pending rows", () => {
    assert.ok(sendFlow);
    assert.match(sendFlow[0], /result\.alreadyInvited \? "Already invited" : "Invitation sent"/);
    assert.match(sendFlow[0], /setReference\(""\)/);
    assert.match(sendFlow[0], /setCandidate\(null\)/);
    assert.match(sendFlow[0], /await loadPendingInvitations\(\)/);
    assert.doesNotMatch(sendFlow[0], /setIsDialogOpen\(false\)/);
});

test("public Circle copy-link flow remains unchanged", () => {
    assert.match(source, /navigator\.clipboard\.writeText\(inviteLink\)/);
    assert.match(source, /mode === "secret" \? \([\s\S]*?\) : \([\s\S]*?Copy/);
});

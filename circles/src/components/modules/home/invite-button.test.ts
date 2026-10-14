import assert from "node:assert/strict";
// @ts-expect-error Bun provides module types at runtime; this repository does not install them.
import { test } from "bun:test";
import type { Circle } from "@/models/models";
import { getInviteButtonMode } from "./invite-button";

test("InviteButton fails closed for Secret Circles and keeps public copy-link invites", () => {
    assert.equal(getInviteButtonMode({ visibility: "secret" } as Circle), null, "Secret renders no Invite UI");
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

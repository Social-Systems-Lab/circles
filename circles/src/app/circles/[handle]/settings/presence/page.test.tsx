import assert from "node:assert/strict";
import React from "react";
// @ts-expect-error Bun provides its test APIs at runtime.
import { mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Circle } from "@/models/models";
import type { PresenceSettingsDto } from "@/lib/data/presence-settings-dto";
import type { CircleRouteAccess } from "../../circle-route-access";

const circle = {
    _id: "fixture-id",
    handle: "fixture",
    circleType: "circle",
    did: "FORBIDDEN_DID",
    email: "FORBIDDEN_EMAIL",
    metadata: { private: "FORBIDDEN_METADATA" },
    location: { street: "FORBIDDEN_ADDRESS" },
    accessRules: { settings: { edit_about: ["FORBIDDEN_RULE"] } },
    offers: { text: "Private content for the editor", visibility: "private", extra: "FORBIDDEN_NESTED" },
    needs: { text: "Members-only content for the editor", visibility: "members", offerHelpEnabled: false },
} as unknown as Circle;

let access: CircleRouteAccess | null;
mock.module("../../circle-page-access", () => ({ getCirclePageAccess: async () => access }));
mock.module("@/components/forms/circle-settings/presence-settings-form", () => ({
    PresenceSettingsForm: ({ circle: data }: { circle: PresenceSettingsDto }) => <pre>{JSON.stringify(data)}</pre>,
}));

const { default: PresenceSettingsPage } = await import("./page");
const props = { params: Promise.resolve({ handle: "fixture" }), searchParams: Promise.resolve({}) };

test("presence settings reject unreadable circles and viewers without edit rights before rendering", async () => {
    for (const viewerAccess of [
        null,
        { circle, viewerDid: undefined, canEditAbout: true },
        {
            circle,
            viewerDid: "did:fixture:member",
            canEditAbout: false,
        },
    ]) {
        access = viewerAccess;
        await assert.rejects(PresenceSettingsPage(props), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
});

test("presence settings serialize only editable content and the values needed to preserve it", async () => {
    access = { circle, viewerDid: "did:fixture:admin", canEditAbout: true };
    const settings = await PresenceSettingsPage(props);
    const children = settings.props.children as React.ReactElement[];
    const editor = children[2].props as { circle: PresenceSettingsDto };
    const data = JSON.parse(JSON.stringify(editor.circle));
    assert.deepEqual(Object.keys(data).sort(), ["_id", "circleType", "engagements", "handle", "needs", "offers"]);
    assert.deepEqual(data.offers, { text: "Private content for the editor", visibility: "private" });
    assert.deepEqual(data.needs, {
        text: "Members-only content for the editor",
        visibility: "members",
        offerHelpEnabled: false,
    });
    assert.doesNotMatch(JSON.stringify(data), /FORBIDDEN_/);
    assert.doesNotMatch(renderToStaticMarkup(settings), /FORBIDDEN_/);
});

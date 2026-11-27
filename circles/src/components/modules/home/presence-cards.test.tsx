import assert from "node:assert/strict";
import React from "react";
// @ts-expect-error Bun provides its test APIs at runtime.
import { mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAboutPageClientProps } from "@/lib/data/client-circle-dto";
import type { Circle } from "@/models/models";

mock.module("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
mock.module("@/app/api/analytics/actions", () => ({ trackEvent: async () => undefined }));
const { default: OffersCard } = await import("./offers-card");
const { default: NeedsCard } = await import("./needs-card");

const emptyCircle: Circle = { handle: "fixture", circleType: "circle" };
const renderCards = (circle: Circle, viewerDid?: string, canEditAbout = false) => {
    const props = buildAboutPageClientProps({
        circle,
        viewerDid,
        canEditAbout,
        fundingPanelVisibility: "sign_in",
        upcomingShiftsVisibility: "sign_in",
    });
    return renderToStaticMarkup(
        <>
            <OffersCard circle={props.circle} canEdit={props.canEditAbout} />
            <NeedsCard circle={props.circle} canEdit={props.canEditAbout} />
        </>,
    );
};

test("anonymous visitors and members without edit permission see no empty cards or editing prompts", () => {
    assert.equal(renderCards(emptyCircle, undefined, true), "");
    assert.equal(renderCards(emptyCircle, "did:fixture:member"), "");
    const html = renderCards(emptyCircle, "did:fixture:admin", true);
    assert.equal((html.match(/>Edit<\/button>/g) ?? []).length, 2);
    assert.match(html, /Tell people 3 ways/);
    assert.match(html, /Ask for help/);
});

test("populated public sections render without edit prompts and private sections stay out of HTML", () => {
    const circle: Circle = {
        ...emptyCircle,
        offers: { text: "Public offer", visibility: "public" },
        needs: { text: "Public need", visibility: "public", offerHelpEnabled: true },
    };
    const html = renderCards(circle);
    assert.match(html, /Public offer/);
    assert.match(html, /Public need/);
    assert.doesNotMatch(html, />Edit<\/button>|Tell people|Ask for help/);

    const protectedCircle: Circle = {
        ...circle,
        offers: { text: "PROTECTED_OFFER", visibility: "private" },
        needs: { text: "PROTECTED_NEED", visibility: "members", offerHelpEnabled: true },
    };
    assert.equal(renderCards(protectedCircle), "");
    assert.doesNotMatch(renderCards(protectedCircle, "did:fixture:admin", true), /PROTECTED_/);
});

test("skills and tags count as content, and profile owners retain the Offers edit control", () => {
    const circle: Circle = {
        ...emptyCircle,
        circleType: "project",
        offers: { skills: ["facilitation"], visibility: "public" },
        needs: { tags: ["design"], visibility: "public", offerHelpEnabled: true },
    };
    const html = renderCards(circle);
    assert.match(html, /facilitation/i);
    assert.match(html, /design/i);
    assert.doesNotMatch(html, />Edit<\/button>|Tell people|Ask for help/);

    const profile = renderCards(
        { ...emptyCircle, circleType: "user", did: "did:fixture:owner" },
        "did:fixture:owner",
        true,
    );
    assert.match(profile, /My offers &amp; skills/);
    assert.equal((profile.match(/>Edit<\/button>/g) ?? []).length, 1);
    assert.doesNotMatch(profile, /What we need help with/);
});

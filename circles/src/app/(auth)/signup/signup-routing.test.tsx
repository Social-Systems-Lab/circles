import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { beforeEach, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

type EntryState = "legacy" | "pending" | "paused" | "unavailable";

const state: { entry: EntryState; redirectTarget?: string } = { entry: "legacy" };

mock.module("@/lib/auth/public-registration-entry", () => ({
    getPublicRegistrationEntryState: async () => state.entry,
    resolvePublicRegistrationEntryView: (entry: EntryState, path: "/signup" | "/signup/pilot") => {
        if (entry === "pending" && path === "/signup/pilot") {
            return { kind: "redirect", destination: "/signup" };
        }
        if (entry === "pending") return { kind: "form", form: "pending" };
        if (entry === "legacy") return { kind: "form", form: "legacy" };
        return { kind: "unavailable", reason: entry };
    },
}));
mock.module("@/components/forms/signup/pilot-signup-form", () => ({
    PilotSignupForm: () => <div>Legacy signup form</div>,
}));
mock.module("@/components/forms/signup/pending-signup-form", () => ({
    PendingSignupForm: () => <div>Pending signup form</div>,
}));
mock.module("next/navigation", () => ({
    redirect: (target: string) => {
        state.redirectTarget = target;
        throw new Error("NEXT_REDIRECT");
    },
}));

const { default: SignupPage } = await import("./page");
const { default: PilotSignupPage } = await import("./pilot/page");

beforeEach(() => {
    state.entry = "legacy";
    state.redirectTarget = undefined;
});

test("explicit legacy routing renders legacy signup at both entry points", async () => {
    assert.match(renderToStaticMarkup(await SignupPage()), /Legacy signup form/);
    assert.match(
        renderToStaticMarkup(await PilotSignupPage({ searchParams: Promise.resolve({}) })),
        /Legacy signup form/,
    );
    assert.equal(state.redirectTarget, undefined);
});

test("pending routing renders pending signup and redirects the old pilot URL once", async () => {
    state.entry = "pending";
    assert.match(renderToStaticMarkup(await SignupPage()), /Pending signup form/);
    await assert.rejects(
        PilotSignupPage({ searchParams: Promise.resolve({ redirectTo: "/explore?view=map" }) }),
        /NEXT_REDIRECT/,
    );
    assert.equal(state.redirectTarget, "/signup?redirectTo=%2Fexplore%3Fview%3Dmap");
});

test("paused routing never renders a nonfunctional signup form", async () => {
    state.entry = "paused";
    const signupHtml = renderToStaticMarkup(await SignupPage());
    const pilotHtml = renderToStaticMarkup(
        await PilotSignupPage({ searchParams: Promise.resolve({ redirectTo: "/explore" }) }),
    );
    assert.match(signupHtml, /Registration temporarily unavailable/);
    assert.match(pilotHtml, /Registration temporarily unavailable/);
    assert.match(`${signupHtml}${pilotHtml}`, /making a few improvements/);
    assert.doesNotMatch(`${signupHtml}${pilotHtml}`, /Legacy signup form|Pending signup form/);
});

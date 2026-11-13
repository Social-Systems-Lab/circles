import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SignupUnavailable } from "@/components/forms/signup/signup-unavailable";

test("paused registration presents a friendly unavailable state with sign-in access", () => {
    const html = renderToStaticMarkup(<SignupUnavailable reason="paused" />);
    assert.match(html, /Registration temporarily unavailable/);
    assert.match(html, /making a few improvements/);
    assert.match(html, /href="\/login"/);
    assert.match(html, /Log in/);
});

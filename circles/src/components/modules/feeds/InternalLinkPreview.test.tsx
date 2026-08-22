import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InternalLinkPreview from "./InternalLinkPreview";

const secretUrl = "/circles/secret-circle/goals/secret-goal-id";
const markup = renderToStaticMarkup(
    React.createElement(InternalLinkPreview, {
        url: secretUrl,
        initialData: null,
        previewType: "goal",
    }),
);

assert.equal(markup, "");
assert.equal(markup.includes(secretUrl), false);

const incompleteMarkup = renderToStaticMarkup(
    React.createElement(InternalLinkPreview, {
        url: secretUrl,
        initialData: {} as never,
    }),
);
assert.equal(incompleteMarkup, "");
assert.equal(incompleteMarkup.includes(secretUrl), false);

const unsupportedMarkup = renderToStaticMarkup(
    React.createElement(InternalLinkPreview, {
        url: secretUrl,
        initialData: { title: "Secret title" } as never,
        previewType: "unsupported" as never,
    }),
);
assert.equal(unsupportedMarkup, "");
assert.equal(unsupportedMarkup.includes(secretUrl), false);

const validMarkup = renderToStaticMarkup(
    React.createElement(InternalLinkPreview, {
        url: "/circles/public/goals/123",
        initialData: { title: "Public goal", stage: "open", description: "Readable" } as never,
        previewType: "goal",
    }),
);
assert.match(validMarkup, /Public goal/);
assert.match(validMarkup, /Readable/);
assert.equal(validMarkup.includes(secretUrl), false);

const malformedUrl = "http://[malformed-preview";
const malformedUrlMarkup = renderToStaticMarkup(
    React.createElement(InternalLinkPreview, {
        url: malformedUrl,
        initialData: { title: "Public goal", stage: "open", description: "Readable" } as never,
        previewType: "goal",
    }),
);
assert.equal(malformedUrlMarkup, "");
assert.equal(malformedUrlMarkup.includes(malformedUrl), false);

const unrecognizedRoute = "/circles/public/not-a-goal/123";
const unrecognizedRouteMarkup = renderToStaticMarkup(
    React.createElement(InternalLinkPreview, {
        url: unrecognizedRoute,
        initialData: { title: "Public goal", stage: "open", description: "Readable" } as never,
        previewType: "goal",
    }),
);
assert.equal(unrecognizedRouteMarkup, "");
assert.equal(unrecognizedRouteMarkup.includes(unrecognizedRoute), false);

console.log("internal link preview fallback tests passed");

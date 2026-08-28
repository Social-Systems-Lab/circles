import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isCanonicalInternalPreviewRoute, parseCanonicalInternalPreviewRoute } from "./internal-preview-route";

const id = new ObjectId().toString();

for (const url of [
    "/circles/current-handle",
    `/circles/current-handle/post/${id}`,
    `/circles/current-handle/tasks/${id}`,
    `/circles/current-handle/shifts/${id}`,
    `/circles/current-handle/events/${id}`,
    `/circles/current-handle/goals/${id}`,
    `/circles/current-handle/issues/${id}`,
    `/circles/current-handle/proposals/${id}`,
    `/circles/current-handle/funding/${id}`,
]) {
    assert.equal(isCanonicalInternalPreviewRoute(url), true, `${url} is canonical`);
    assert.ok(parseCanonicalInternalPreviewRoute(url));
}

for (const url of [
    "/circles/../admin",
    "/circles/?query",
    "/circles/#hash",
    "/circles/javascript:alert",
    "/circles/",
    `/circles/current-handle/events/${id}?query=1`,
    `/circles/current-handle/events/${id}#hash`,
    `/circles/current-handle/events/../${id}`,
    "/circles/current-handle/events/%2e%2e",
    "/circles/current-handle/settings/about",
    "/circles/current-handle/events/not-an-object-id",
    `/circles/current-handle/events/${id}/`,
    `/circles/current-handle/events/${id.toUpperCase()}`,
    "https://kamooni.org/circles/current-handle",
]) {
    assert.equal(isCanonicalInternalPreviewRoute(url), false, `${url} is rejected`);
    assert.equal(parseCanonicalInternalPreviewRoute(url), null);
}

console.log("internal preview route tests passed");

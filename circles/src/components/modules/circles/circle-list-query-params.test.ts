import assert from "node:assert/strict";
import {
    buildCircleInventoryFilterUrl,
    parseCircleInventoryFilters,
    shouldReplaceCircleInventoryFilters,
} from "./circle-list-query-params";

assert.deepEqual(parseCircleInventoryFilters(), { includeCreated: true, includeMember: true });
assert.deepEqual(parseCircleInventoryFilters({ includeCreated: "false", includeMember: "false" }), {
    includeCreated: false,
    includeMember: false,
});
assert.deepEqual(parseCircleInventoryFilters({ includeCreated: "true", includeMember: "true" }), {
    includeCreated: true,
    includeMember: true,
});

const updatedUrl = buildCircleInventoryFilterUrl("?sort=newest&sdgs=climate%2Cpeace&tab=discover", {
    includeCreated: false,
    includeMember: true,
});
const updatedParams = new URLSearchParams(updatedUrl.slice(1));
assert.equal(updatedParams.get("includeCreated"), "false");
assert.equal(updatedParams.get("includeMember"), "true");
assert.equal(updatedParams.get("sort"), "newest");
assert.equal(updatedParams.get("sdgs"), "climate,peace");
assert.equal(updatedParams.get("tab"), "discover");

assert.equal(
    shouldReplaceCircleInventoryFilters(
        { includeCreated: true, includeMember: true },
        { includeCreated: true, includeMember: true },
    ),
    false,
    "matching initial URL state does not trigger navigation",
);
assert.equal(
    shouldReplaceCircleInventoryFilters(
        { includeCreated: false, includeMember: true },
        { includeCreated: true, includeMember: true },
    ),
    true,
    "a checkbox change triggers one atomic URL replacement",
);

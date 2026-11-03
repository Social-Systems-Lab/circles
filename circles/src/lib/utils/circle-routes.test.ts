import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Bun provides its test APIs at runtime.
import { test } from "bun:test";
import { getCircleDefaultPath } from "./circle-routes";

test("personal profile links use the canonical circles route", () => {
    assert.equal(getCircleDefaultPath({ handle: "hircill-ngoiee" }), "/circles/hircill-ngoiee/home");
});

test("non-personal circle links continue to use their configured default module", () => {
    assert.equal(
        getCircleDefaultPath({ handle: "community", enabledModules: ["feed", "followers"] }),
        "/circles/community/feed",
    );
    assert.equal(
        getCircleDefaultPath({ handle: "community", enabledModules: ["home", "feed"] }),
        "/circles/community/home",
    );
});

test("member and mobile avatar navigation use the shared route helper", () => {
    const membersTable = readFileSync("src/components/modules/members/members-table.tsx", "utf8");
    const circlePicture = readFileSync("src/components/modules/circles/circle-picture.tsx", "utf8");

    assert.match(membersTable, /router\.push\(getCircleDefaultPath\(\{ handle: member\.handle \}\)\)/);
    assert.match(circlePicture, /router\.push\(getCircleDefaultPath\(circle\)\)/);
    assert.doesNotMatch(membersTable + circlePicture, /\/circle\/\$\{/);
});

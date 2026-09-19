import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
    filterContributionsByPublicSource,
    isContributionSourcePubliclyVisible,
    isQualifyingProfileContribution,
} from "./contribution-visibility-policy";

const source = (overrides: Record<string, unknown> = {}) =>
    ({
        _id: new ObjectId(),
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
        ...overrides,
    }) as any;

test("general-profile contribution sources require a canonical public organizational owner", () => {
    assert.equal(isContributionSourcePubliclyVisible(source()), true);
    assert.equal(isContributionSourcePubliclyVisible(source({ circleType: "project" })), true);
    assert.equal(
        isContributionSourcePubliclyVisible(source({ visibility: undefined })),
        true,
        "legacy missing visibility remains public",
    );
    assert.equal(isContributionSourcePubliclyVisible(source({ visibility: "secret" })), false);
    assert.equal(isContributionSourcePubliclyVisible(source({ circleType: "user" })), false);
    assert.equal(isContributionSourcePubliclyVisible(source({ circleType: undefined })), false);
    assert.equal(isContributionSourcePubliclyVisible(source({ _id: "malformed" })), false);
    assert.equal(isContributionSourcePubliclyVisible(null), false);
});

test("outcome credit requires assignment, resolution, and verification", () => {
    const did = "did:example:profile";
    const valid = { assignedTo: did, stage: "resolved", verifiedAt: new Date(), verifiedBy: "did:example:verifier" };
    assert.equal(isQualifyingProfileContribution(valid, did), true);
    assert.equal(isQualifyingProfileContribution({ ...valid, assignedTo: undefined } as any, did), false);
    assert.equal(isQualifyingProfileContribution({ ...valid, assignedTo: "did:example:other" }, did), false);
    assert.equal(isQualifyingProfileContribution({ ...valid, stage: "review" }, did), false);
    assert.equal(isQualifyingProfileContribution({ ...valid, verifiedAt: null }, did), false);
    assert.equal(isQualifyingProfileContribution({ ...valid, verifiedBy: null }, did), false);
});

test("shift credit requires attended status and attendance verification", () => {
    const did = "did:example:profile";
    const shift = (participant: Record<string, unknown>) => ({
        taskType: "shift",
        participants: [{ userDid: did, ...participant }],
    });
    assert.equal(
        isQualifyingProfileContribution(shift({ attendanceStatus: "attended", attendanceVerifiedAt: new Date() }), did),
        true,
    );
    assert.equal(
        isQualifyingProfileContribution(
            shift({ attendanceStatus: "did_not_attend", attendanceVerifiedAt: new Date() }),
            did,
        ),
        false,
    );
    assert.equal(isQualifyingProfileContribution(shift({ attendanceStatus: "attended" }), did), false);
    assert.equal(isQualifyingProfileContribution(shift({ attendanceStatus: "confirmed" }), did), false);
});

test("contribution publication follows readable lifecycle, including paused public sources", () => {
    assert.equal(isContributionSourcePubliclyVisible(source({ moderationStatus: "paused" })), true);
    assert.equal(isContributionSourcePubliclyVisible(source({ moderationStatus: undefined })), true);
    assert.equal(isContributionSourcePubliclyVisible(source({ moderationStatus: "suspended" })), false);
    assert.equal(isContributionSourcePubliclyVisible(source({ moderationStatus: "removed" })), false);
});

test("mixed contribution DTOs retain only public-source rows and cannot leak Secret fields", () => {
    const publicCircle = source({ name: "Public Circle" });
    const secretCircle = source({ visibility: "secret", name: "Secret Circle" });
    const rows = [
        { circleId: publicCircle._id.toString(), title: "Public task", verifiedAt: new Date() },
        {
            circleId: secretCircle._id.toString(),
            title: "Secret title",
            verifiedAt: new Date(),
            contributionNote: "Secret note",
        },
        { circleId: new ObjectId().toString(), title: "Missing owner" },
        { circleId: "bad", title: "Malformed owner" },
    ];
    const result = filterContributionsByPublicSource(rows, [publicCircle, secretCircle]);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "Public task");
    assert.equal(JSON.stringify(result).includes("Secret"), false);
});

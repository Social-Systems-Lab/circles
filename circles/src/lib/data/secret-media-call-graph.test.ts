import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

async function main() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const allowedDirectSaveFile = new Set([
        "src/lib/data/verification-workflow.ts",
        "src/components/modules/home/actions.ts",
        "src/components/modules/chat/actions.ts",
        "src/components/modules/chat/mongo-actions.ts",
    ]);
    const { execFileSync } = await import("node:child_process");
    const matches = execFileSync("rg", ["-l", "saveFile\\(", "src", "--glob", "!**/*.test.ts"], {
        cwd: root,
        encoding: "utf8",
    })
        .trim()
        .split("\n")
        .filter(Boolean);
    assert.deepEqual(
        new Set(matches),
        allowedDirectSaveFile,
        "every direct saveFile caller must be explicitly classified",
    );

    const helper = await readFile(path.join(root, "src/lib/data/circle-media-storage.ts"), "utf8");
    const secretBranch = helper.slice(
        helper.indexOf("if (!(await dependencies.isMember"),
        helper.indexOf("export type OwnedMediaKind"),
    );
    assert.match(secretBranch, /dependencies\.savePrivate\(/);
    assert.match(secretBranch, /PRIVATE_MEDIA_PATH_PREFIX/);
    assert.doesNotMatch(secretBranch, /savePublic\(/);
    assert.doesNotMatch(secretBranch, /MINIO_BUCKET|["'`]\/storage\/|["'`]\/uploads\//);
    assert.match(helper, /parsePrivateMediaUrl\(url\)/);
    assert.match(helper, /expectedCircleId/);
    assert.match(helper, /dependencies\.deletePrivate\(classified\.mediaId!, new ObjectId\(expectedCircleId\)/);
    const circlePersist = helper.indexOf("await persist()");
    const circleCleanup = helper.indexOf("return cleanup([...new Set(urls)], expectedCircleId)", circlePersist);
    assert.ok(circlePersist >= 0 && circleCleanup >= 0 && circlePersist < circleCleanup);

    for (const caller of [
        "src/components/modules/feeds/actions.ts",
        "src/app/circles/[handle]/settings/about/actions.ts",
        "src/app/circles/[handle]/events/actions.ts",
        "src/app/circles/[handle]/tasks/actions.ts",
        "src/app/circles/[handle]/goals/actions.ts",
    ]) {
        const source = await readFile(path.join(root, caller), "utf8");
        assert.match(source, /saveCircleOwnedFile\(/, `${caller} must delegate media selection to the real helper`);
    }

    const privateMedia = await readFile(path.join(root, "src/lib/data/private-media.ts"), "utf8");
    assert.match(privateMedia, /record\.ownerType !== "circle"/);
    assert.match(privateMedia, /record\.circleId !== new ObjectId\(expectedCircleId\)\.toHexString\(\)/);
    assert.ok(
        privateMedia.includes("const PRIVATE_MEDIA_URL_PATTERN = /^\\/private-media\\/([0-9a-fA-F]{24})$/;"),
        "private media identity must be an exact canonical relative URL",
    );

    const circleData = await readFile(path.join(root, "src/lib/data/circle.ts"), "utf8");
    const creationReject = circleData.indexOf('if (circle.visibility === "secret")');
    const creationPersistence = circleData.indexOf("Circles.insertOne(circle)", creationReject);
    assert.ok(
        creationReject >= 0 && creationPersistence > creationReject,
        "Secret creation must fail before persistence",
    );

    for (const route of ["src/app/storage/[...path]/route.ts", "src/app/uploads/[...path]/route.ts"]) {
        const source = await readFile(path.join(root, route), "utf8");
        assert.match(source, /process\.env\.MINIO_BUCKET/);
        assert.doesNotMatch(source, /MINIO_PRIVATE_BUCKET|privateMedia|getPrivateMediaBucketName/);
        assert.doesNotMatch(source, /searchParams.*bucket|params.*bucket/);
    }

    for (const caller of [
        "src/app/circles/[handle]/settings/about/actions.ts",
        "src/components/circle-wizard/actions.ts",
        "src/components/onboarding/actions.ts",
        "src/app/circles/[handle]/goals/actions.ts",
        "src/app/circles/[handle]/issues/actions.ts",
        "src/app/circles/[handle]/proposals/actions.ts",
        "src/app/circles/[handle]/funding/actions.ts",
    ]) {
        const source = await readFile(path.join(root, caller), "utf8");
        assert.match(
            source,
            /cleanupCircleOwnedMedia\(|persistCircleThenCleanupMedia\(|completeFundingPostMutation\(/,
            `${caller} must use the production cleanup seam`,
        );
        assert.match(source + helper, /old media cleanup did not complete|old media file could not be removed/);
    }

    const settings = await readFile(path.join(root, "src/app/circles/[handle]/settings/about/actions.ts"), "utf8");
    for (const marker of [
        "collectReplacedCircleMedia(",
        "persistCircleThenCleanupMedia(",
        "updateCircle(circleUpdateData, userDid)",
    ])
        assert.ok(settings.indexOf(marker) >= 0, `missing Circle replacement marker: ${marker}`);
    for (const caller of [
        "src/components/circle-wizard/actions.ts",
        "src/components/onboarding/actions.ts",
        "src/components/modules/home/actions.ts",
    ]) {
        const source = await readFile(path.join(root, caller), "utf8");
        for (const marker of ["collectReplacedCircleMedia(", "persistCircleThenCleanupMedia("])
            assert.ok(source.indexOf(marker) >= 0, `${caller} missing Circle replacement marker: ${marker}`);
    }
    const goals = await readFile(path.join(root, "src/app/circles/[handle]/goals/actions.ts"), "utf8");
    assert.ok(
        goals.indexOf("await updateGoal(goalId, flatUpdateData)") < goals.indexOf("await cleanupCircleOwnedMedia("),
        "Goal update must persist the valid mutation before reporting cleanup failure",
    );

    const onboarding = await readFile(path.join(root, "src/components/onboarding/actions.ts"), "utf8");
    const onboardingStart = onboarding.indexOf("export const saveProfileAction");
    const onboardingEnd = onboarding.indexOf("export const saveLocationAction", onboardingStart);
    assert.ok(onboardingStart >= 0 && onboardingEnd > onboardingStart, "onboarding profile action must exist");
    const onboardingProfile = onboarding.slice(onboardingStart, onboardingEnd);
    const onboardingAuthorization = onboardingProfile.indexOf(
        "isAuthorized(userDid, circleId, features.settings.edit_about)",
    );
    const onboardingCircleLoad = onboardingProfile.indexOf("getCircleById(circleId)");
    const onboardingUpload = onboardingProfile.indexOf("saveCircleOwnedFile(");
    const onboardingPersistence = onboardingProfile.indexOf("updateCircle(circle, userDid)");
    for (const [label, marker] of [
        ["authorization", onboardingAuthorization],
        ["Circle load", onboardingCircleLoad],
        ["media upload", onboardingUpload],
        ["Circle persistence", onboardingPersistence],
    ] as const) {
        assert.ok(marker >= 0, `onboarding profile action missing ${label} marker`);
    }
    assert.ok(
        onboardingAuthorization < onboardingCircleLoad &&
            onboardingCircleLoad < onboardingUpload &&
            onboardingUpload < onboardingPersistence,
        "onboarding authorization and canonical Circle load must precede every media write and persistence",
    );

    const proposals = await readFile(path.join(root, "src/app/circles/[handle]/proposals/actions.ts"), "utf8");
    const proposalCleanup = proposals.indexOf("await cleanupMediaBeforeSourceDelete(");
    const proposalDelete = proposals.indexOf("() => deleteProposal(proposalId)", proposalCleanup);
    assert.ok(proposalCleanup >= 0 && proposalDelete >= 0 && proposalCleanup < proposalDelete);

    const funding = await readFile(path.join(root, "src/app/circles/[handle]/funding/actions.ts"), "utf8");
    const fundingPersistence = funding.indexOf("const updated = await updateFundingAskDocument");
    const fundingCleanup = funding.indexOf("await completeFundingPostMutation(", fundingPersistence);
    const fundingNoticeboard = funding.indexOf("maybeCreateFundingNoticeboardPost(", fundingCleanup);
    assert.ok(fundingPersistence >= 0 && fundingCleanup >= 0 && fundingNoticeboard >= 0);
    assert.ok(fundingPersistence < fundingCleanup && fundingCleanup < fundingNoticeboard);

    const readHandler = await readFile(path.join(root, "src/app/private-media/[mediaId]/handler.ts"), "utf8");
    for (const marker of [
        "dependencies.authenticate()",
        "resolvePrivateMediaRequest",
        "canReadPrivateMediaRecord",
        "dependencies.statObject",
        "dependencies.getObject",
    ]) {
        assert.ok(readHandler.indexOf(marker) >= 0, `missing private read marker: ${marker}`);
    }
    assert.doesNotMatch(readHandler, /superadmin|isSuperAdmin/);

    const transition = await readFile(path.join(root, "src/lib/data/circle-visibility-transition.ts"), "utf8");
    const preflight = transition.indexOf("await preflight(circleId)");
    const persistence = transition.indexOf("await dependencies.updateVisibility");
    assert.ok(
        preflight >= 0 && persistence >= 0 && preflight < persistence,
        "media preflight must precede visibility persistence",
    );

    console.log("secret media call graph tests passed");
}

void main();

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error Bun provides test and module mocking at runtime; Bun types are not installed in this repository.
import { mock, test } from "bun:test";
import { Client as MinioClient } from "minio";
import { MongoClient, ObjectId, type Db } from "mongodb";

const TEST_MONGO_PORT = "27028";
const TEST_MINIO_PORT = "29000";
const DATABASE_PREFIX = "circles_stage1a_test_";
const authState: { did?: string; authorized: boolean } = { authorized: true };

const integrationTestOptedIn = process.env.ONBOARDING_INTEGRATION_TEST === "1";
if (!integrationTestOptedIn) {
    console.log("onboarding MongoDB and MinIO integration tests skipped: explicit opt-in is not set");
}

function assertLoopback(hostname: string, service: string) {
    assert.ok(["127.0.0.1", "localhost", "::1"].includes(hostname), `${service} must use a loopback hostname`);
}

function getValidatedConfiguration() {
    assert.equal(process.env.NODE_ENV, "test", "integration tests require NODE_ENV=test");
    assert.equal(process.env.LOCAL_FS_STORAGE, "false", "local project-directory storage must be disabled");
    assert.equal(process.env.VDB_ENABLED, "false", "integration tests must not contact vector services");

    const mongoUri = process.env.MONGODB_URI;
    assert.ok(mongoUri, "MONGODB_URI is required");
    const mongoUrl = new URL(mongoUri);
    assert.equal(mongoUrl.protocol, "mongodb:", "MongoDB URI must use mongodb protocol");
    assertLoopback(mongoUrl.hostname, "MongoDB");
    assert.equal(mongoUrl.port, TEST_MONGO_PORT, "MongoDB must use the dedicated integration-test port");
    assert.equal(
        mongoUrl.pathname,
        "/admin",
        "MongoDB URI database must be admin; app database is selected explicitly",
    );
    assert.equal(mongoUrl.username, "onboarding_test", "MongoDB must use the disposable test container user");

    const configuredDatabase = process.env.CIRCLES_MONGODB_DATABASE;
    assert.ok(configuredDatabase?.startsWith(DATABASE_PREFIX), "effective application database needs the test prefix");
    const effectiveDatabase = configuredDatabase || "circles";
    assert.equal(effectiveDatabase, configuredDatabase, "the application must not fall back to the default database");

    const minioHost = process.env.MINIO_HOST;
    assert.ok(minioHost, "MINIO_HOST is required");
    assertLoopback(minioHost, "MinIO");
    assert.equal(process.env.MINIO_PORT, TEST_MINIO_PORT, "MinIO must use the dedicated integration-test port");
    assert.equal(
        process.env.MINIO_ROOT_USERNAME,
        "onboarding_test",
        "MinIO must use the disposable test container user",
    );
    assert.ok(process.env.MINIO_ROOT_PASSWORD, "disposable MinIO credentials are required");

    const appDir = process.env.APP_DIR;
    assert.ok(appDir, "APP_DIR must point to a fresh temporary directory");
    const resolvedAppDir = path.resolve(appDir);
    const resolvedProjectDir = path.resolve(process.cwd());
    assert.notEqual(resolvedAppDir, resolvedProjectDir, "APP_DIR must be outside the project");
    assert.ok(!resolvedAppDir.startsWith(`${resolvedProjectDir}${path.sep}`), "APP_DIR must not be inside the project");
    assert.notEqual(resolvedAppDir, path.resolve("/circles"), "APP_DIR must not be production storage");
    assert.ok(
        !resolvedAppDir.startsWith(`${path.resolve("/circles")}${path.sep}`),
        "APP_DIR must not be production storage",
    );
    assert.notEqual(resolvedAppDir, path.resolve("/root/circles/circles"));
    assert.ok(
        !resolvedAppDir.startsWith(`${path.resolve("/root/circles/circles")}${path.sep}`),
        "APP_DIR must not be the production application directory",
    );
    const appDirParent = fs.realpathSync(path.dirname(resolvedAppDir));
    const allowedTempParents = new Set([fs.realpathSync(os.tmpdir()), fs.realpathSync("/tmp")]);
    assert.ok(allowedTempParents.has(appDirParent), "APP_DIR must be directly under a canonical system temp directory");
    assert.equal(fs.existsSync(resolvedAppDir), false, "APP_DIR must not already contain credentials or data");

    return { mongoUri, effectiveDatabase, appDir: resolvedAppDir, minioHost };
}

function assertDisposableContainer(
    name: string,
    containerPort: string,
    hostPort: string,
    expectedTmpfsPaths: string[],
) {
    const tmpfs = JSON.parse(
        execFileSync("docker", ["inspect", `--format={{json .HostConfig.Tmpfs}}`, name], { encoding: "utf8" }),
    ) as Record<string, string>;
    assert.deepEqual(
        Object.keys(tmpfs).sort(),
        [...expectedTmpfsPaths].sort(),
        `${name} must use only approved tmpfs paths`,
    );
    assert.ok(
        Object.values(tmpfs).every((options) => options.includes("size=")),
        `${name} tmpfs must be size-limited`,
    );

    const mounts = JSON.parse(
        execFileSync("docker", ["inspect", `--format={{json .Mounts}}`, name], { encoding: "utf8" }),
    ) as Array<{ Type: string; Destination: string }>;
    assert.equal(mounts.length, 0, `${name} must have no persistent Docker volumes or bind mounts`);

    const ports = JSON.parse(
        execFileSync("docker", ["inspect", `--format={{json .NetworkSettings.Ports}}`, name], { encoding: "utf8" }),
    ) as Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    const mappings = ports[`${containerPort}/tcp`];
    assert.ok(mappings?.length, `${name} must publish its service port`);
    assert.ok(
        mappings.every((mapping) => mapping.HostIp === "127.0.0.1" && mapping.HostPort === hostPort),
        `${name} must publish only the approved loopback test port`,
    );
}

if (integrationTestOptedIn) {
    const config = getValidatedConfiguration();
    const appDir = config.appDir;
    assertDisposableContainer("kamooni-onboarding-mongo-test", "27017", TEST_MONGO_PORT, [
        "/data/db",
        "/data/configdb",
    ]);
    assertDisposableContainer("kamooni-onboarding-minio-test", "9000", TEST_MINIO_PORT, ["/data"]);

    const mongoClient = new MongoClient(config.mongoUri);
    const minio = new MinioClient({
        endPoint: config.minioHost,
        port: Number(TEST_MINIO_PORT),
        useSSL: false,
        accessKey: process.env.MINIO_ROOT_USERNAME!,
        secretKey: process.env.MINIO_ROOT_PASSWORD!,
    });

    const fixtureProfileIds = new Set<string>();
    const pngBytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pV8AAAAASUVORK5CYII=",
        "base64",
    );

    async function createProfile(database: Db, suffix: string, overrides: Record<string, unknown> = {}) {
        const _id = new ObjectId();
        const did = `did:test-onboarding-${new ObjectId().toHexString()}`;
        fixtureProfileIds.add(_id.toHexString());
        const profile = {
            _id,
            did,
            name: `Onboarding Integration ${suffix}`,
            handle: `onboarding-test-${suffix}`,
            circleType: "user",
            moderationStatus: "active",
            content: "Legacy introduction remains available.",
            ...overrides,
        };
        await database.collection("circles").insertOne(profile);
        return profile;
    }

    async function assertObjectExists(objectName: string, exists: boolean) {
        if (exists) {
            await minio.statObject("circles", objectName);
            return;
        }
        await assert.rejects(minio.statObject("circles", objectName));
    }

    async function listMediaObjects(prefix: string) {
        const objects: string[] = [];
        for await (const object of minio.listObjects("circles", prefix, true)) {
            if (object.name) objects.push(object.name);
        }
        return objects;
    }

    let disposableDatabaseVerifiedEmpty = false;
    let appDirCreated = false;

    async function run() {
        await mongoClient.connect();
        const uriSelectedDatabase = mongoClient.db(config.effectiveDatabase);
        assert.equal(
            uriSelectedDatabase.databaseName,
            config.effectiveDatabase,
            "MongoClient's effective database selection must equal the explicitly validated app database",
        );
        const collectionsBefore = await uriSelectedDatabase.listCollections({}, { nameOnly: true }).toArray();
        assert.equal(
            collectionsBefore.length,
            0,
            `the disposable database must be empty before fixtures are inserted; found ${collectionsBefore.map((item) => item.name).join(", ")}`,
        );
        assert.equal(
            await minio.listBuckets().then((buckets) => buckets.length),
            0,
            "the disposable MinIO instance must be empty",
        );
        disposableDatabaseVerifiedEmpty = true;

        fs.mkdirSync(appDir, { recursive: false });
        appDirCreated = true;
        assert.equal(
            fs.existsSync(path.join(appDir, "users")),
            false,
            "test APP_DIR starts without account credentials",
        );
        process.env.APP_DIR = appDir;
        mock.module("@/lib/auth/auth", () => ({
            getAuthenticatedUserDid: async () => authState.did,
            isAuthorized: async () => authState.authorized,
            getAuthorizedMembers: async () => [],
            createServerDid: async () => {
                throw new Error("The integration fixture must never generate server credentials");
            },
            getServerPublicKey: () => {
                throw new Error("The integration fixture must never read server credentials");
            },
            signRegisterServerChallenge: () => {
                throw new Error("The integration fixture must never sign server credentials");
            },
            signRegisterUserChallenge: () => {
                throw new Error("The integration fixture must never read or sign member credentials");
            },
            USERS_DIR: path.join(appDir, "users"),
        }));
        mock.module("next/cache", () => ({ revalidatePath: () => undefined }));

        const database = uriSelectedDatabase;
        const circleCollection = database.collection("circles");
        await database
            .collection("serverSettings")
            .insertOne({ defaultCircleId: "test-default-circle", did: "did:test-server" });

        const { getDb } = await import("@/lib/data/db");
        assert.equal(
            (await getDb()).databaseName,
            config.effectiveDatabase,
            "application db.ts selects the validated test database",
        );
        const {
            acceptOnboardingCommunityGuidelinesAction,
            saveOnboardingIntroductionAction,
            saveOnboardingLocationAction,
        } = await import("@/app/onboarding/card-actions");
        const { updateCircleField } = await import("@/components/modules/home/actions");

        const originalAcceptedAt = new Date("2024-01-02T03:04:05.000Z");
        const profile = await createProfile(database, "primary", {
            communityGuidelinesAcceptance: {
                truth: { accepted: true, acceptedAt: originalAcceptedAt },
            },
        });
        authState.did = profile.did;
        authState.authorized = true;

        const introductionResult = await saveOnboardingIntroductionAction("  Finding community.  ");
        assert.equal(introductionResult.success, true);
        const afterIntroduction = await circleCollection.findOne({ _id: profile._id });
        assert.equal(afterIntroduction?.description, "Finding community.");
        assert.equal(afterIntroduction?.content, "Legacy introduction remains available.");
        assert.equal(afterIntroduction?.did, profile.did);

        const guidelineResult = await acceptOnboardingCommunityGuidelinesAction(true);
        assert.equal(guidelineResult.success, true);
        const afterGuidelines = await circleCollection.findOne({ _id: profile._id });
        assert.equal(
            afterGuidelines?.communityGuidelinesAcceptance?.truth?.acceptedAt?.getTime(),
            originalAcceptedAt.getTime(),
        );
        for (const rule of ["constructive", "respect", "privacy", "responsibility"]) {
            assert.equal(afterGuidelines?.communityGuidelinesAcceptance?.[rule]?.accepted, true);
            assert.ok(afterGuidelines?.communityGuidelinesAcceptance?.[rule]?.acceptedAt instanceof Date);
        }
        const rejectedAgreement = await acceptOnboardingCommunityGuidelinesAction(false);
        assert.equal(rejectedAgreement.success, false);

        const selectedPin = {
            precision: 2,
            country: "Test Country",
            region: "Test Region",
            city: "Test Town",
            street: "Test Public Library",
            lngLat: { lng: 18.4233, lat: -33.9189 },
        };
        const locationResult = await saveOnboardingLocationAction(selectedPin);
        assert.equal(locationResult.success, true);
        const afterLocation = await circleCollection.findOne({ _id: profile._id });
        assert.equal(afterLocation?.location?.precision, 4, "newly selected personal pins use public map precision");
        assert.deepEqual(afterLocation?.location?.lngLat, selectedPin.lngLat);
        assert.equal(afterLocation?.location?.street, selectedPin.street);

        const foreignProfile = await createProfile(database, "foreign");
        authState.did = `did:test-onboarding-outsider-${new ObjectId().toHexString()}`;
        authState.authorized = true;
        const unauthorizedForm = new FormData();
        unauthorizedForm.set("picture", new File([pngBytes], "test.png", { type: "image/png" }));
        const unauthorizedResult = await updateCircleField(foreignProfile._id.toHexString(), unauthorizedForm);
        assert.equal(unauthorizedResult.success, false, "non-owner cannot update a personal profile photo");
        assert.equal(
            await minio.listBuckets().then((buckets) => buckets.length),
            0,
            "rejected upload creates no bucket or object",
        );
        assert.equal((await circleCollection.findOne({ _id: foreignProfile._id }))?.picture, undefined);

        authState.did = profile.did;
        authState.authorized = false;
        const deniedByAuthorization = await updateCircleField(profile._id.toHexString(), unauthorizedForm);
        assert.equal(deniedByAuthorization.success, false);
        assert.equal(
            await minio.listBuckets().then((buckets) => buckets.length),
            0,
            "authorization denial stores no media",
        );

        authState.authorized = true;
        const uploadedForm = new FormData();
        uploadedForm.set("picture", new File([pngBytes], "profile.png", { type: "image/png" }));
        const uploadedResult = await updateCircleField(profile._id.toHexString(), uploadedForm);
        assert.equal(uploadedResult.success, true);
        const savedPictureUrl = uploadedResult.circle?.picture?.url;
        assert.equal(typeof savedPictureUrl, "string");
        assert.match(savedPictureUrl!, new RegExp(`^/storage/${profile._id.toHexString()}/`));
        const savedObjectName = savedPictureUrl!.slice("/storage/".length);
        await assertObjectExists(savedObjectName, true);
        assert.equal((await circleCollection.findOne({ _id: profile._id }))?.picture?.url, savedPictureUrl);

        const oldObjectName = `${foreignProfile._id.toHexString()}/previous-picture.png`;
        const oldPictureUrl = `/storage/${oldObjectName}`;
        await minio.putObject("circles", oldObjectName, pngBytes, pngBytes.length, { "Content-Type": "image/png" });
        await circleCollection.updateOne({ _id: foreignProfile._id }, { $set: { picture: { url: oldPictureUrl } } });
        await database.command({
            collMod: "circles",
            validator: {
                $or: [{ "picture.url": oldPictureUrl }, { "picture.url": { $exists: false } }],
            },
            validationLevel: "strict",
            validationAction: "error",
        });
        authState.did = foreignProfile.did;
        const failedWriteForm = new FormData();
        failedWriteForm.set("picture", new File([pngBytes], "replacement.png", { type: "image/png" }));
        const failedWriteResult = await updateCircleField(foreignProfile._id.toHexString(), failedWriteForm);
        assert.equal(failedWriteResult.success, false, "database validation rejects the injected picture write");
        assert.equal((await circleCollection.findOne({ _id: foreignProfile._id }))?.picture?.url, oldPictureUrl);
        await assertObjectExists(oldObjectName, true);
        const foreignObjects = await listMediaObjects(`${foreignProfile._id.toHexString()}/`);
        assert.deepEqual(
            foreignObjects,
            [oldObjectName],
            "failed database write removes its new object and preserves the old referenced object",
        );

        assert.equal(
            fs.existsSync(path.join(appDir, "users")),
            false,
            "integration tests create no credential directories",
        );
        console.log("onboarding MongoDB and MinIO integration tests passed against the validated disposable services");
    }

    test("onboarding persistence and media updates stay within disposable services", async () => {
        try {
            await run();
        } finally {
            try {
                if (disposableDatabaseVerifiedEmpty) {
                    const database = mongoClient.db(config.effectiveDatabase);
                    for (const profileId of fixtureProfileIds) {
                        const objects = await listMediaObjects(`${profileId}/`).catch(() => []);
                        for (const objectName of objects) {
                            await minio.removeObject("circles", objectName).catch(() => undefined);
                        }
                    }
                    await database.dropDatabase();
                }
            } catch (error) {
                console.error("Disposable onboarding test cleanup failed:", error);
                process.exitCode = 1;
            } finally {
                await mongoClient.close().catch(() => undefined);
                if (appDirCreated) fs.rmSync(appDir, { recursive: true, force: true });
            }
        }
    });
}

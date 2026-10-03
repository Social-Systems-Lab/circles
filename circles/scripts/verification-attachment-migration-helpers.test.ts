import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "stream";
import {
    ensureVerifiedPrivateCopy,
    hasEffectiveAnonymousGetObjectDeny,
} from "./verification-attachment-migration-helpers";

const publicBucket = "circles";
const privateBucket = "circles-verification";
const sourceObject = "owner/verification-attachment1.pdf";
const destinationObject = "request/message/legacy-0-verification-attachment1.pdf";

const fakeClient = (source: Buffer, destination?: Buffer) => {
    const objects = new Map<string, Buffer>([[`${publicBucket}/${sourceObject}`, source]]);
    if (destination) objects.set(`${privateBucket}/${destinationObject}`, destination);
    let copies = 0;
    const client = {
        async statObject(bucket: string, objectName: string) {
            const value = objects.get(`${bucket}/${objectName}`);
            if (!value) throw Object.assign(new Error("missing"), { code: "NoSuchKey" });
            return { size: value.length, etag: `etag-${value.length}` };
        },
        async getObject(bucket: string, objectName: string) {
            const value = objects.get(`${bucket}/${objectName}`);
            if (!value) throw Object.assign(new Error("missing"), { code: "NoSuchKey" });
            return Readable.from(value);
        },
        async copyObject(bucket: string, objectName: string) {
            copies++;
            objects.set(`${bucket}/${objectName}`, Buffer.from(source));
        },
    };
    return { client, copies: () => copies };
};

const ensure = (client: ReturnType<typeof fakeClient>["client"]) =>
    ensureVerifiedPrivateCopy({ client, publicBucket, privateBucket, sourceObject, destinationObject });

test("absent destination is copied and verified before an update is allowed", async () => {
    const fake = fakeClient(Buffer.from("evidence"));
    let mongoUpdates = 0;
    assert.equal(await ensure(fake.client), "copied");
    mongoUpdates++;
    assert.equal(fake.copies(), 1);
    assert.equal(mongoUpdates, 1);
});

test("matching destination is safely reused", async () => {
    const evidence = Buffer.from("evidence");
    const fake = fakeClient(evidence, Buffer.from(evidence));
    assert.equal(await ensure(fake.client), "reused");
    assert.equal(fake.copies(), 0);
});

test("different destination aborts before Mongo update", async () => {
    const fake = fakeClient(Buffer.from("evidence"), Buffer.from("altered!"));
    let mongoUpdates = 0;
    await assert.rejects(async () => {
        await ensure(fake.client);
        mongoUpdates++;
    }, /mismatch/);
    assert.equal(mongoUpdates, 0);
    assert.equal(fake.copies(), 0);
});

test("partial prior run is a safe retry", async () => {
    const evidence = Buffer.from("evidence");
    const fake = fakeClient(evidence);
    assert.equal(await ensure(fake.client), "copied");
    assert.equal(await ensure(fake.client), "reused");
    assert.equal(fake.copies(), 1);
});

const requiredResources = [
    "arn:aws:s3:::circles/*/verification-attachment*",
    "arn:aws:s3:::circles/archive/*/verification-attachment*",
];
const statement = {
    Effect: "Deny",
    Principal: "*",
    Action: ["s3:GetObject"],
    Resource: requiredResources,
};

test("complete anonymous GetObject deny is accepted", () => {
    assert.equal(hasEffectiveAnonymousGetObjectDeny({ Statement: [statement] }, requiredResources), true);
    assert.equal(
        hasEffectiveAnonymousGetObjectDeny(
            { Statement: [{ ...statement, Principal: { AWS: "*" } }] },
            requiredResources,
        ),
        true,
    );
});

test("wrong principal is rejected", () => {
    assert.equal(
        hasEffectiveAnonymousGetObjectDeny({ Statement: [{ ...statement, Principal: "user" }] }, requiredResources),
        false,
    );
});

test("wrong action is rejected", () => {
    assert.equal(
        hasEffectiveAnonymousGetObjectDeny(
            { Statement: [{ ...statement, Action: ["s3:PutObject"] }] },
            requiredResources,
        ),
        false,
    );
});

test("incomplete resources are rejected", () => {
    assert.equal(
        hasEffectiveAnonymousGetObjectDeny(
            { Statement: [{ ...statement, Resource: [requiredResources[0]] }] },
            requiredResources,
        ),
        false,
    );
});

for (const disallowedKey of ["Condition", "NotPrincipal", "NotAction", "NotResource"] as const) {
    test(`deny containing ${disallowedKey} is rejected`, () => {
        assert.equal(
            hasEffectiveAnonymousGetObjectDeny(
                { Statement: [{ ...statement, [disallowedKey]: { unexpected: true } }] },
                requiredResources,
            ),
            false,
        );
    });
}

test("malformed deny statements are rejected", () => {
    assert.equal(hasEffectiveAnonymousGetObjectDeny({ Statement: [null, "deny", 42] }, requiredResources), false);
});

test("deny attributes scattered across unrelated statements are rejected", () => {
    assert.equal(
        hasEffectiveAnonymousGetObjectDeny(
            {
                Statement: [
                    { Effect: "Deny", Principal: "user", Action: ["s3:GetObject"], Resource: requiredResources },
                    { Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: requiredResources },
                ],
            },
            requiredResources,
        ),
        false,
    );
});

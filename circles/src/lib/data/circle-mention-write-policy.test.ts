import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";
import { canReadCircle } from "./circle-visibility-policy";
import {
    canonicalizeCircleMentionsForWrite,
    CIRCLE_REFERENCE_UNAVAILABLE,
    type CircleMentionWriteDependencies,
} from "./circle-mention-write-policy";

const publicId = new ObjectId();
const missingVisibilityId = new ObjectId();
const projectId = new ObjectId();
const secretId = new ObjectId();
const userId = new ObjectId();
const pausedId = new ObjectId();
const suspendedId = new ObjectId();
const removedId = new ObjectId();
const escapedNameId = new ObjectId();

const circles: Circle[] = [
    { _id: publicId, name: "Public Current", handle: "public-current", circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: missingVisibilityId, name: "Legacy Public", handle: "legacy-public", circleType: "circle", moderationStatus: "active" },
    { _id: projectId, name: "Public Project", handle: "public-project", circleType: "project", visibility: "public", moderationStatus: "active" },
    { _id: secretId, name: "Secret Current", handle: "secret-current", circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: userId, name: "Profile Current", handle: "profile-current", circleType: "user", visibility: "secret", moderationStatus: "suspended" },
    { _id: pausedId, name: "Paused Current", handle: "paused-current", circleType: "circle", visibility: "public", moderationStatus: "paused" },
    { _id: suspendedId, name: "Suspended Current", handle: "suspended-current", circleType: "circle", visibility: "secret", moderationStatus: "suspended" },
    { _id: removedId, name: "Removed Current", handle: "removed-current", circleType: "circle", visibility: "secret", moderationStatus: "removed" },
    { _id: escapedNameId, name: String.raw`A [bracket] \ path (team)`, handle: "escaped-name", circleType: "circle", visibility: "public", moderationStatus: "active" },
] as Circle[];

const link = (label: string, identifier: string) => `[${label}](/circles/${identifier})`;
const unavailable = { ok: false, error: CIRCLE_REFERENCE_UNAVAILABLE } as const;

function dependencies(member: Member | null = null): CircleMentionWriteDependencies {
    return {
        findCircles: async ({ objectIds, handles }) =>
            circles.filter(
                (circle) =>
                    objectIds.some((id) => id.equals(circle._id as ObjectId)) || handles.includes(circle.handle!),
            ),
        canReadCircle: (writerDid, circle) =>
            canReadCircle(writerDid, circle, {
                getMember: async (did, circleId) =>
                    member?.userDid === did && member.circleId === circleId ? member : null,
            }),
    };
}

const resolve = (content: string, deps = dependencies()) =>
    canonicalizeCircleMentionsForWrite(content, "did:writer", deps);

async function testObjectIdAndHandleCanonicalization() {
    assert.deepEqual(await resolve(link("Fake Name", publicId.toString())), {
        ok: true,
        content: link("Public Current", "public-current"),
        mentions: [{ type: "circle", id: publicId.toString() }],
    });
    assert.deepEqual(await resolve(link("Old Name", "public-current")), {
        ok: true,
        content: link("Public Current", "public-current"),
        mentions: [{ type: "circle", id: publicId.toString() }],
    });
    assert.deepEqual(await resolve(link("Encoded", "%70ublic-current")), {
        ok: true,
        content: link("Public Current", "public-current"),
        mentions: [{ type: "circle", id: publicId.toString() }],
    });
    assert.deepEqual(await resolve(`[Decorated](</circles/public-current>)`), {
        ok: true,
        content: link("Public Current", "public-current"),
        mentions: [{ type: "circle", id: publicId.toString() }],
    });
    assert.deepEqual(await resolve(link("Missing", new ObjectId().toString())), unavailable);
    assert.deepEqual(await resolve(link("Stale", "old-handle")), unavailable);
}

async function testCentralVisibilityAndLifecyclePolicy() {
    for (const circle of [circles[0], circles[1], circles[2], circles[4], circles[5]]) {
        const result = await resolve(link("Injected", circle.handle!));
        assert.equal(result.ok, true, circle.handle);
    }
    assert.deepEqual(await resolve(link("Hidden", "secret-current")), unavailable);
    assert.deepEqual(await resolve(link("Superadmin", "secret-current")), unavailable);
    assert.deepEqual(await resolve(link("Former", "secret-current"), dependencies(null)), unavailable);
    assert.deepEqual(
        await resolve(
            link("Suspended", "suspended-current"),
            dependencies({ userDid: "did:writer", circleId: suspendedId.toString() } as Member),
        ),
        unavailable,
    );
    assert.deepEqual(
        await resolve(
            link("Removed", "removed-current"),
            dependencies({ userDid: "did:writer", circleId: removedId.toString() } as Member),
        ),
        unavailable,
    );

    const member = { userDid: "did:writer", circleId: secretId.toString() } as Member;
    assert.deepEqual(await resolve(link("Forged Secret", "secret-current"), dependencies(member)), {
        ok: true,
        content: link("Secret Current", "secret-current"),
        mentions: [{ type: "circle", id: secretId.toString() }],
    });
}

async function testMultipleTargetsAndDeduplication() {
    const member = { userDid: "did:writer", circleId: secretId.toString() } as Member;
    const content = `${link("A", publicId.toString())}, ${link("B", "secret-current")}; ${link("C", "profile-current")} ${link("Again", "public-current")}!`;
    assert.deepEqual(await resolve(content, dependencies(member)), {
        ok: true,
        content: `${link("Public Current", "public-current")}, ${link("Secret Current", "secret-current")}; ${link("Profile Current", "profile-current")} ${link("Public Current", "public-current")}!`,
        mentions: [
            { type: "circle", id: publicId.toString() },
            { type: "circle", id: secretId.toString() },
            { type: "circle", id: userId.toString() },
        ],
    });
    assert.deepEqual(await resolve(`${link("A", "public-current")} ${link("No", "missing")}`), unavailable);
}

async function testMarkdownSafetyAndBoundaries() {
    assert.deepEqual(await resolve(link("Injected", "escaped-name")), {
        ok: true,
        content: String.raw`[A \[bracket\] \\ path (team)](/circles/escaped-name)`,
        mentions: [{ type: "circle", id: escapedNameId.toString() }],
    });

    const plain = [
        "Ordinary Public Current prose",
        "@public-current",
        "/circles/public-current",
        "prefix/circles/public-current",
        "[External](https://example.test/circles/public-current)",
        "![Image](/circles/public-current)",
        String.raw`\[Escaped](/circles/public-current)`,
    ];
    for (const content of plain) assert.deepEqual(await resolve(content), { ok: true, content, mentions: [] });

    const rejected = [
        link("Bad", "%ZZ"),
        link("Bad", "public-current/child"),
        "[Bad](/circles/public-current?x=1)",
        "[Bad](/circles/public-current#x)",
        "[Bad](/circles/public-current child)",
        "[Bad](/circles/public-current-extra)",
        "[Broken](/circles/public-current",
        "[Broken](</circles/public-current",
        "[Broken](</circles/public-current>) trailing [Missing](/circles/nope)",
        String.raw`[Bad](/circles/public-current\))`,
    ];
    for (const content of rejected) assert.deepEqual(await resolve(content), unavailable, content);

    const punctuation = `(${link("Old", "public-current")}), ${link("Again", "public-current")}.`;
    const result = await resolve(punctuation);
    assert.equal(result.ok && result.content, `(${link("Public Current", "public-current")}), ${link("Public Current", "public-current")}.`);
    assert.deepEqual(await resolve(String.raw`\\[Old](/circles/public-current)`), {
        ok: true,
        content: String.raw`\\[Public Current](/circles/public-current)`,
        mentions: [{ type: "circle", id: publicId.toString() }],
    });
    assert.deepEqual(await resolve(String.raw`\\\[Old](/circles/public-current)`), {
        ok: true,
        content: String.raw`\\\[Old](/circles/public-current)`,
        mentions: [],
    });
}

async function main() {
    await testObjectIdAndHandleCanonicalization();
    await testCentralVisibilityAndLifecyclePolicy();
    await testMultipleTargetsAndDeduplication();
    await testMarkdownSafetyAndBoundaries();
    console.log("circle mention write policy tests passed");
}

void main();

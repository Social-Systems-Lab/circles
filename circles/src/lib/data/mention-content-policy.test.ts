import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Circle } from "@/models/models";
import { sanitizeCircleMentionsInTextItems } from "./mention-content-policy";

const publicId = new ObjectId();
const secretId = new ObjectId();
const secondId = new ObjectId();
const pausedId = new ObjectId();
const suspendedId = new ObjectId();
const removedId = new ObjectId();
const userId = new ObjectId();
const circles: Circle[] = [
    { _id: publicId, name: "Public Canonical", handle: "public", circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: secretId, name: "Secret Canonical", handle: "secret", circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: secondId, name: "Second Canonical", handle: "second", circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: pausedId, name: "Paused Canonical", handle: "paused", circleType: "circle", visibility: "public", moderationStatus: "paused" },
    { _id: suspendedId, name: "Suspended", handle: "suspended", circleType: "circle", visibility: "public", moderationStatus: "suspended" },
    { _id: removedId, name: "Removed", handle: "removed", circleType: "circle", visibility: "public", moderationStatus: "removed" },
    { _id: userId, name: "User Canonical", handle: "person", circleType: "user", visibility: "secret", moderationStatus: "active" },
] as Circle[];

const mention = (label: string, identifier: string) => `[${label}](/circles/${identifier})`;

function dependencies(memberIds: string[] = []) {
    let calls = 0;
    let requestedIds: string[] = [];
    let requestedHandles: string[] = [];
    return {
        get calls() { return calls; },
        get requestedIds() { return requestedIds; },
        get requestedHandles() { return requestedHandles; },
        findReadableCircles: async ({ objectIds, handles }: { objectIds: ObjectId[]; handles: string[] }) => {
            calls += 1;
            requestedIds = objectIds.map(String);
            requestedHandles = handles;
            return circles.filter((circle) => {
                const referenced = objectIds.some((id) => id.equals(circle._id as ObjectId)) || handles.includes(circle.handle!);
                const lifecycleReadable = circle.moderationStatus !== "suspended" && circle.moderationStatus !== "removed";
                const visibilityReadable = circle.circleType === "user" || circle.visibility !== "secret" || memberIds.includes(circle._id!.toString());
                return referenced && lifecycleReadable && visibilityReadable;
            });
        },
    };
}

async function sanitize(content: string, memberIds: string[] = []) {
    const deps = dependencies(memberIds);
    const [result] = await sanitizeCircleMentionsInTextItems([{ content }], "did:viewer", deps);
    return { result, deps };
}

async function testCanonicalAndUnavailableRewriting() {
    assert.equal((await sanitize(mention("Forged", publicId.toString()))).result.content, mention("Public Canonical", "public"));
    assert.equal((await sanitize(mention("Old", "public"))).result.content, mention("Public Canonical", "public"));
    assert.equal((await sanitize(mention("Old", "%70ublic"))).result.content, mention("Public Canonical", "public"));
    assert.equal((await sanitize(mention("Secret Old", secretId.toString()))).result.content, "Unavailable Circle");
    assert.equal((await sanitize(mention("Secret Old", secretId.toString()), [secretId.toString()])).result.content, mention("Secret Canonical", "secret"));
    assert.equal((await sanitize(mention("Superadmin is irrelevant", "secret"))).result.content, "Unavailable Circle");
    assert.equal((await sanitize(mention("Paused Old", pausedId.toString()))).result.content, mention("Paused Canonical", "paused"));
    assert.equal((await sanitize(mention("Suspended Old", suspendedId.toString()))).result.content, "Unavailable Circle");
    assert.equal((await sanitize(mention("Removed Old", removedId.toString()))).result.content, "Unavailable Circle");
    assert.equal((await sanitize(mention("User Old", userId.toString()))).result.content, mention("User Canonical", "person"));
    assert.equal((await sanitize(mention("Missing Old", new ObjectId().toString()))).result.content, "Unavailable Circle");
}

async function testMixedPunctuationAndBatching() {
    const source = `(${mention("A", publicId.toString())}), ${mention("Hidden", secretId.toString())}; ${mention("B", "second")}]. ${mention("Again", publicId.toString())}`;
    const { result, deps } = await sanitize(source);
    assert.equal(result.content, `(${mention("Public Canonical", "public")}), Unavailable Circle; ${mention("Second Canonical", "second")}]. ${mention("Public Canonical", "public")}`);
    assert.equal(deps.calls, 1);
    assert.equal(deps.requestedIds.filter((id) => id === publicId.toString()).length, 1);
    assert.equal(deps.requestedHandles.filter((handle) => handle === "second").length, 1);
}

async function testClassificationBoundaries() {
    const external = "[External](https://example.test/circles/public)";
    const bare = "/circles/public";
    const unrelated = "prefix/circles/public";
    const incomplete = "[Broken](/circles/public";
    const inputs = [
        [mention("Bad", "%ZZ"), "Unavailable Circle"],
        [mention("Bad", "public/child"), "Unavailable Circle"],
        ["[Bad](/circles/public?x=1)", "Unavailable Circle"],
        ["[Bad](/circles/public#x)", "Unavailable Circle"],
        ["[Bad](/circles/public child)", "Unavailable Circle"],
        [external, external],
        [bare, bare],
        [unrelated, unrelated],
        [incomplete, incomplete],
        ["[External](/other/public)", "[External](/other/public)"],
        ["![Image](/circles/public)", "![Image](/circles/public)"],
        ["\\[Escaped](/circles/public)", "\\[Escaped](/circles/public)"],
        ["[Hidden\\]](/circles/secret)", "Unavailable Circle"],
        ["[Hidden\\[x](/circles/secret)", "Unavailable Circle"],
        ["[Hidden](</circles/secret>)", "Unavailable Circle"],
    ];
    for (const [input, expected] of inputs) assert.equal((await sanitize(input)).result.content, expected);
}

function markdownLinkCount(content: string): number {
    const tree = unified().use(remarkParse).parse(content) as { type: string; children?: unknown[] };
    let count = 0;
    const visit = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const value = node as { type?: string; children?: unknown[] };
        if (value.type === "link") count += 1;
        value.children?.forEach(visit);
    };
    visit(tree);
    return count;
}

async function testMarkdownEscapeParity() {
    const cases = [
        { input: String.raw`[Hidden](/circles/secret)`, active: true, expected: "Unavailable Circle" },
        { input: String.raw`\[Hidden](/circles/secret)`, active: false },
        { input: String.raw`\\[Hidden](/circles/secret)`, active: true, expected: String.raw`\\Unavailable Circle` },
        { input: String.raw`\\\[Hidden](/circles/secret)`, active: false },
    ];
    for (const value of cases) {
        assert.equal(markdownLinkCount(value.input), value.active ? 1 : 0, value.input);
        const output = (await sanitize(value.input)).result.content;
        assert.equal(output, value.expected ?? value.input, value.input);
        assert.equal(markdownLinkCount(output), 0, value.input);
    }
    assert.equal(markdownLinkCount("[Hidden\\]](/circles/secret)"), 1);
    assert.equal(markdownLinkCount("[Hidden](</circles/secret>)"), 1);
}

async function testMetadataIsIgnoredAndRemoved() {
    const forgedCircle = { _id: secretId, did: "did:secret", name: "Leak", handle: "secret", description: "Leak" };
    const inputs = [
        { content: mention("A", publicId.toString()), mentions: [{ id: secretId.toString() }] },
        { content: mention("A", publicId.toString()), mentions: [] },
        { content: "No occurrence", mentions: [{ id: secretId.toString() }, { id: secretId.toString() }] },
        { content: mention("A", publicId.toString()), mentionsDisplay: [{ id: secretId.toString(), circle: forgedCircle }] },
    ];
    const results = await sanitizeCircleMentionsInTextItems(inputs, "did:viewer", dependencies());
    assert.equal(results[0].content, mention("Public Canonical", "public"));
    assert.equal(results[1].content, mention("Public Canonical", "public"));
    assert.equal(results[2].content, "No occurrence");
    for (const result of results) {
        assert.equal(Object.prototype.hasOwnProperty.call(result, "mentions"), false);
        assert.equal(Object.prototype.hasOwnProperty.call(result, "mentionsDisplay"), false);
        assert.equal(JSON.stringify(result).includes("did:secret"), false);
    }
}

async function testPreviewExemption() {
    const item = { content: mention("Preview Label", "public") };
    const result = await sanitizeCircleMentionsInTextItems([item], "did:viewer", dependencies(), {
        exemptRangesByItem: new Map([[item, new Set([`0:${item.content.length}`])]]),
    });
    assert.equal(result[0].content, item.content);
}

async function main() {
    await testCanonicalAndUnavailableRewriting();
    await testMixedPunctuationAndBatching();
    await testClassificationBoundaries();
    await testMarkdownEscapeParity();
    await testMetadataIsIgnoredAndRemoved();
    await testPreviewExemption();
    console.log("mention content policy tests passed");
}

void main();

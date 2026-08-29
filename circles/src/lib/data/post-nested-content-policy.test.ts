import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import type { Circle, Event, PostDisplay } from "@/models/models";
import {
    INTERNAL_PREVIEW_TYPES,
    resolveInternalPreviewUrl,
    resolveInternalPreviewAction,
    sanitizePostNestedContent,
    type InternalPreviewType,
} from "./post-nested-content-policy";

const id = () => new ObjectId();
const viewerDid = "did:viewer";
const publicCircleId = id();
const secretCircleId = id();
const pausedCircleId = id();
const suspendedCircleId = id();
const removedCircleId = id();
const secondSecretCircleId = id();

const circle = (circleId: ObjectId, overrides: Partial<Circle> = {}): Circle =>
    ({
        _id: circleId,
        name: "Circle",
        handle: `circle-${circleId}`,
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
        ...overrides,
    }) as Circle;

const circleDocs = new Map<string, Circle>([
    [publicCircleId.toString(), circle(publicCircleId)],
    [secretCircleId.toString(), circle(secretCircleId, { visibility: "secret" })],
    [secondSecretCircleId.toString(), circle(secondSecretCircleId, { visibility: "secret" })],
    [pausedCircleId.toString(), circle(pausedCircleId, { moderationStatus: "paused" })],
    [suspendedCircleId.toString(), circle(suspendedCircleId, { moderationStatus: "suspended" })],
    [removedCircleId.toString(), circle(removedCircleId, { moderationStatus: "removed" })],
]);

const resourceIds = Object.fromEntries(
    INTERNAL_PREVIEW_TYPES.filter((type) => type !== "circle").map((type) => [type, id()]),
) as Record<Exclude<InternalPreviewType, "circle">, ObjectId>;

const resources = new Map<string, any>();
const resourceKey = (type: string, resourceId: ObjectId | string) => `${type}:${resourceId.toString()}`;

const seedResource = (type: Exclude<InternalPreviewType, "circle" | "post">, ownerId: ObjectId) => {
    const common = { _id: resourceIds[type], circleId: ownerId.toString() };
    const resource =
        type === "task"
            ? { ...common, title: "Task", taskType: "task", stage: "open", images: [] }
            : type === "event"
              ? { ...common, title: "Event", startAt: new Date(), images: [], hostCircleIds: [] }
              : type === "goal"
                ? { ...common, title: "Goal", stage: "open", description: "Goal description", images: [] }
                : type === "issue"
                  ? { ...common, title: "Issue", stage: "open" }
                  : type === "proposal"
                    ? { ...common, name: "Proposal", stage: "open" }
                    : {
                          ...common,
                          title: "Funding",
                          shortStory: "Funding story",
                          status: "open",
                          items: [
                              {
                                  title: "Private item title",
                                  category: "other",
                                  price: 10,
                                  currency: "USD",
                                  quantity: 2,
                                  status: "open",
                                  note: "Private note",
                              },
                          ],
                      };
    resources.set(resourceKey(type, resourceIds[type]), resource);
    return resource;
};

const author = circle(id(), { circleType: "user", did: "did:author", name: "Author", handle: "author" });

const post = (type: InternalPreviewType, previewId: string, url?: string): PostDisplay =>
    ({
        _id: id().toString(),
        feedId: id().toString(),
        createdBy: author.did!,
        createdAt: new Date(),
        content: `Before ${url ?? `/circles/public/${type}/${previewId}`} after`,
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
        author,
        circleType: "post",
        internalPreviewType: type,
        internalPreviewId: previewId,
        internalPreviewUrl: url ?? `https://kamooni.test/circles/public/${type}/${previewId}`,
    }) as PostDisplay;

const queryCounts = new Map<string, number>();
const dependencies = (memberIds: string[] = [], postReadable = true) => ({
    findReadableMentionCircles: async ({ objectIds, handles }: { objectIds: ObjectId[]; handles: string[] }) =>
        Array.from(circleDocs.values()).filter((value) =>
            (objectIds.some((objectId) => objectId.equals(value._id as ObjectId)) || handles.includes(value.handle!)) &&
            value.moderationStatus !== "suspended" &&
            value.moderationStatus !== "removed" &&
            (value.circleType === "user" || value.visibility !== "secret" || memberIds.includes(value._id!.toString())),
        ),
    findResources: async (type: string, ids: ObjectId[]) => {
        queryCounts.set(type, (queryCounts.get(type) ?? 0) + 1);
        return ids.map((resourceId) => resources.get(resourceKey(type, resourceId))).filter(Boolean);
    },
    findCirclesByHandles: async (handles: string[]) => {
        queryCounts.set("circle", (queryCounts.get("circle") ?? 0) + 1);
        return Array.from(circleDocs.values()).filter((value) => value.handle && handles.includes(value.handle));
    },
    findReadableCircles: async (ids: ObjectId[]) => {
        queryCounts.set("owners", (queryCounts.get("owners") ?? 0) + 1);
        return ids
            .map((ownerId) => circleDocs.get(ownerId.toString()))
            .filter((value): value is Circle => Boolean(value))
            .filter(
                (value) =>
                    value.moderationStatus !== "suspended" &&
                    value.moderationStatus !== "removed" &&
                    (value.visibility !== "secret" || memberIds.includes(value._id!.toString())),
            );
    },
    findAuthors: async () => [author],
    resolvePost: async (postId: string) =>
        postReadable && postId === resourceIds.post.toString()
            ? {
                  post: {
                      _id: resourceIds.post.toString(),
                      feedId: id().toString(),
                      createdBy: author.did!,
                      createdAt: new Date(),
                      content: "Readable post content",
                      reactions: {},
                      comments: 0,
                      userGroups: ["everyone"],
                  },
                  feed: {
                      _id: id().toString(),
                      circleId: publicCircleId.toString(),
                      name: "Feed",
                      handle: "default",
                      createdAt: new Date(),
                      userGroups: ["everyone"],
                  },
                  circle: circleDocs.get(publicCircleId.toString())!,
              }
            : null,
});

const assertStripped = (value: PostDisplay, secretParts: string[] = []) => {
    assert.equal(value.internalPreviewType, undefined);
    assert.equal(value.internalPreviewId, undefined);
    assert.equal(value.internalPreviewUrl, undefined);
    assert.equal(value.internalPreviewData, undefined);
    assert.match(value.content, /Unavailable content/);
    for (const part of secretParts) assert.equal(value.content.includes(part), false);
};

async function testEveryPreviewType() {
    for (const type of INTERNAL_PREVIEW_TYPES) {
        resources.clear();
        const previewId =
            type === "circle" ? circleDocs.get(publicCircleId.toString())!.handle! : resourceIds[type].toString();
        if (type !== "circle" && type !== "post") seedResource(type, publicCircleId);
        const url = `https://kamooni.test/circles/public/${type}/${previewId}`;
        const [readable] = await sanitizePostNestedContent([post(type, previewId, url)], viewerDid, dependencies());
        assert.equal(readable.internalPreviewType, type, `${type} readable type`);
        assert.ok(readable.internalPreviewData, `${type} readable data`);
        assert.ok(readable.internalPreviewUrl?.startsWith("/circles/"), `${type} canonical URL`);
        assert.equal(readable.content.includes(url), false, `${type} untrusted URL removed from content`);
        assert.ok(readable.content.includes(readable.internalPreviewUrl!), `${type} canonical content URL`);

        if (type === "post") {
            const [hidden] = await sanitizePostNestedContent(
                [post(type, previewId, url)],
                viewerDid,
                dependencies([], false),
            );
            assertStripped(hidden, [previewId, url]);
        } else if (type === "circle") {
            const secret = circleDocs.get(secretCircleId.toString())!;
            const hiddenUrl = `https://kamooni.test/circles/${secret.handle}`;
            const [hidden] = await sanitizePostNestedContent(
                [post(type, secret.handle!, hiddenUrl)],
                viewerDid,
                dependencies(),
            );
            assertStripped(hidden, [secret.handle!, hiddenUrl]);
            const [member] = await sanitizePostNestedContent(
                [post(type, secret.handle!, hiddenUrl)],
                viewerDid,
                dependencies([secretCircleId.toString()]),
            );
            assert.ok(member.internalPreviewData);
        } else {
            seedResource(type, secretCircleId);
            const [hidden] = await sanitizePostNestedContent([post(type, previewId, url)], viewerDid, dependencies());
            assertStripped(hidden, [previewId, url]);
            const [member] = await sanitizePostNestedContent(
                [post(type, previewId, url)],
                viewerDid,
                dependencies([secretCircleId.toString()]),
            );
            assert.ok(member.internalPreviewData);
        }

        const malformedUrl = `https://kamooni.test/circles/hidden/${type}/malformed`;
        const [malformed] = await sanitizePostNestedContent(
            [post(type, "malformed", malformedUrl)],
            viewerDid,
            dependencies(),
        );
        assertStripped(malformed, ["malformed", malformedUrl]);
        const missingId = type === "circle" ? "deleted-circle" : id().toString();
        const missingUrl = `https://kamooni.test/circles/hidden/${type}/${missingId}`;
        const [missing] = await sanitizePostNestedContent(
            [post(type, missingId, missingUrl)],
            viewerDid,
            dependencies([], type === "post" ? false : true),
        );
        assertStripped(missing, [missingId, missingUrl]);
    }
}

async function testLifecycleAndSuperadmin() {
    for (const [ownerId, expected] of [
        [publicCircleId, true],
        [pausedCircleId, true],
        [suspendedCircleId, false],
        [removedCircleId, false],
    ] as const) {
        resources.clear();
        seedResource("goal", ownerId);
        const [result] = await sanitizePostNestedContent(
            [post("goal", resourceIds.goal.toString())],
            viewerDid,
            dependencies(),
        );
        assert.equal(Boolean(result.internalPreviewData), expected);
    }
    resources.clear();
    seedResource("goal", secretCircleId);
    const [superadmin] = await sanitizePostNestedContent(
        [post("goal", resourceIds.goal.toString())],
        "did:superadmin",
        dependencies(),
    );
    assertStripped(superadmin);
}

async function testEventAllHosts() {
    resources.clear();
    const event = seedResource("event", publicCircleId) as Event & { hostCircleIds?: any };
    const input = () => post("event", resourceIds.event.toString());

    delete event.hostCircleIds;
    assert.ok((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0].internalPreviewData);
    event.hostCircleIds = null;
    assert.ok((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0].internalPreviewData);
    event.hostCircleIds = [publicCircleId.toString(), publicCircleId.toString()];
    assert.ok((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0].internalPreviewData);
    event.hostCircleIds = [secretCircleId.toString(), secondSecretCircleId.toString()];
    assertStripped((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0]);
    assert.ok(
        (
            await sanitizePostNestedContent(
                [input()],
                viewerDid,
                dependencies([secretCircleId.toString(), secondSecretCircleId.toString()]),
            )
        )[0].internalPreviewData,
    );
    event.hostCircleIds = "malformed";
    assertStripped((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0]);
    event.hostCircleIds = ["malformed"];
    assertStripped((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0]);
    event.hostCircleIds = [id().toString()];
    assertStripped((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0]);
    event.hostCircleIds = [suspendedCircleId.toString()];
    assertStripped((await sanitizePostNestedContent([input()], viewerDid, dependencies()))[0]);
}

async function testContentAndBatching() {
    resources.clear();
    seedResource("goal", secretCircleId);
    const previewUrl = `/circles/secret/goals/${resourceIds.goal}`;
    const mentionId = id().toString();
    const input = post("goal", resourceIds.goal.toString(), previewUrl);
    input.content = `Keep [Secret goal](${previewUrl}) and [User](/circles/${mentionId}) text`;
    input.mentions = [{ type: "circle", id: mentionId }];
    const [result] = await sanitizePostNestedContent([input], viewerDid, dependencies());
    assert.equal(result.content, "Keep Unavailable content and Unavailable Circle text");

    queryCounts.clear();
    resources.clear();
    seedResource("goal", publicCircleId);
    await sanitizePostNestedContent(
        [post("goal", resourceIds.goal.toString()), post("goal", resourceIds.goal.toString())],
        viewerDid,
        dependencies(),
    );
    assert.equal(queryCounts.get("goal"), 1);
    assert.equal(queryCounts.get("owners"), 1);
}

async function testPreviewTokenBoundariesAndMentionCollision() {
    resources.clear();
    seedResource("goal", secretCircleId);
    const url = `/circles/secret/goals/${resourceIds.goal}`;
    const distinctMention = "/circles/legitimate-mention";
    const cases = [
        { previewUrl: url, content: url },
        { previewUrl: url, content: `before ${url} after` },
        { previewUrl: url, content: `"${url}" '${url}' [${url}] (${url})` },
        { previewUrl: url, content: `${url}, ${url}. ${url}! ${url}? ${url}; ${url}: ${url}] ${url})` },
        { previewUrl: `${url}/`, content: `${url}/` },
        { previewUrl: `${url}?view=compact`, content: `${url}?view=compact` },
        { previewUrl: `${url}#details`, content: `${url}#details` },
        {
            previewUrl: `/circles/secret/goals/${resourceIds.goal.toString().replace("a", "%61")}`,
            content: `/circles/secret/goals/${resourceIds.goal.toString().replace("a", "%61")}`,
        },
        { previewUrl: url, content: `${url} ${url}` },
        { previewUrl: url, content: `[Goal](${url})` },
    ];
    for (const { previewUrl, content } of cases) {
        const input = post("goal", resourceIds.goal.toString(), previewUrl);
        input.content = `${content} [Mention](${distinctMention}) [Other](https://example.test/${resourceIds.goal})`;
        input.mentions = [
            { type: "circle", id: "secret" },
            { type: "circle", id: "legitimate-mention" },
        ];
        const [result] = await sanitizePostNestedContent([input], viewerDid, dependencies());
        assert.equal(result.content.includes(url), false, content);
        assert.ok(result.content.includes("Unavailable content"), content);
        assert.ok(result.content.includes("Unavailable Circle"), content);
        assert.equal(result.content.includes(distinctMention), false, content);
        assert.ok(result.content.includes(`https://example.test/${resourceIds.goal}`), content);
    }
}

async function testDuplicateCirclePreviewAndMentionOwnership() {
    const secret = circleDocs.get(secretCircleId.toString())!;
    const target = `/circles/${secret.handle}`;
    const input = (content: string) => {
        const value = post("circle", secret.handle!, target);
        value.content = content;
        return value;
    };

    const labeled = `[Preview](${target})\n[Mention](${target})`;
    const [outsider] = await sanitizePostNestedContent([input(labeled)], viewerDid, dependencies());
    assert.equal(outsider.content, "Unavailable content\nUnavailable Circle");

    // With no bare preview URL, the first matching active labeled link deterministically owns the preview.
    const reversed = `[Mention](${target})\n[Preview](${target})`;
    const [reversedOutsider] = await sanitizePostNestedContent([input(reversed)], viewerDid, dependencies());
    assert.equal(reversedOutsider.content, "Unavailable content\nUnavailable Circle");

    // Composer persistence prefers the first bare occurrence; labeled links with the same target remain mentions.
    const bareAndLabeled = `${target}\n[Mention](${target})`;
    const [bareOutsider] = await sanitizePostNestedContent([input(bareAndLabeled)], viewerDid, dependencies());
    assert.equal(bareOutsider.content, "Unavailable content\nUnavailable Circle");

    const [member] = await sanitizePostNestedContent(
        [input(labeled)],
        viewerDid,
        dependencies([secretCircleId.toString()]),
    );
    assert.equal(member.content, `[Preview](${target})\n[Circle](${target})`);

    for (const result of [outsider, reversedOutsider, bareOutsider]) {
        assert.equal(result.content.includes(secret.handle!), false);
        assert.equal(result.content.includes("Preview"), false);
        assert.equal(result.content.includes("Mention"), false);
    }
}

async function testLongerPreviewPrefixIsNotRewritten() {
    resources.clear();
    seedResource("task", secretCircleId);
    const exactUrl = "/tasks/abc";
    const longerUrl = "/tasks/abcdef";
    const input = post("task", resourceIds.task.toString(), exactUrl);
    input.content = `${exactUrl} ${longerUrl}`;
    const [result] = await sanitizePostNestedContent([input], viewerDid, dependencies());
    assert.equal(result.content, `Unavailable content ${longerUrl}`);
}

async function testInternalPreviewActionNeutralBoundary() {
    const unavailable = { error: "Preview unavailable" };
    assert.deepEqual(
        await resolveInternalPreviewAction("/circles/public", {
            getViewerDid: async () => {
                throw new Error("authentication detail");
            },
        }),
        unavailable,
    );
    assert.deepEqual(
        await resolveInternalPreviewAction("/circles/public", { getViewerDid: async () => undefined }),
        unavailable,
    );
    assert.deepEqual(
        await resolveInternalPreviewAction("/circles/public", {
            getViewerDid: async () => viewerDid,
            resolvePreview: async () => null,
        }),
        unavailable,
    );
    const success = {
        type: "circle" as const,
        id: "public",
        url: "/circles/public",
        data: { name: "Public" },
    };
    assert.deepEqual(
        await resolveInternalPreviewAction("/circles/browser-supplied", {
            getViewerDid: async () => viewerDid,
            resolvePreview: async () => success,
        }),
        success,
    );
}

async function testCanonicalSinglePreviewResolverAndDtoMinimization() {
    const publicCircle = circleDocs.get(publicCircleId.toString())!;
    for (const type of INTERNAL_PREVIEW_TYPES) {
        resources.clear();
        if (type !== "circle" && type !== "post") seedResource(type, publicCircleId);
        const idValue = type === "circle" ? publicCircle.handle! : resourceIds[type].toString();
        const segment = type === "circle" ? "" : `/${type === "post" ? "post" : `${type}s`.replace("fundings", "funding")}/${idValue}`;
        const result = await resolveInternalPreviewUrl(
            `/circles/browser-supplied${type === "circle" ? "" : segment}`.replace("/circles/browser-supplied", type === "circle" ? `/circles/${idValue}` : "/circles/browser-supplied"),
            viewerDid,
            dependencies(),
        );
        assert.ok(result, `${type} resolves`);
        assert.equal(result!.type, type);
        const value = result!.data as Record<string, unknown>;
        for (const removed of ["_id", "did", "handle", "circleId", "createdBy", "createdAt", "feedId", "reactions", "comments", "userGroups"])
            assert.equal(removed in value, false, `${type} omits ${removed}`);
        if (type === "funding") {
            assert.deepEqual(Object.keys((value.items as Record<string, unknown>[])[0]).sort(), [
                "currency",
                "price",
                "quantity",
                "status",
            ]);
        }
    }

    resources.clear();
    seedResource("proposal", secretCircleId);
    seedResource("issue", secretCircleId);
    for (const type of ["proposal", "issue"] as const) {
        const result = await resolveInternalPreviewUrl(
            `/circles/${publicCircle.handle}/${type}s/${resourceIds[type]}`,
            viewerDid,
            dependencies(),
        );
        assert.equal(result, null, `${type} trusts canonical owner, not URL handle`);
    }
    resources.clear();
    const event = seedResource("event", publicCircleId) as Event;
    event.hostCircleIds = [secretCircleId.toString()];
    assert.equal(
        await resolveInternalPreviewUrl(`/circles/public/events/${resourceIds.event}`, viewerDid, dependencies()),
        null,
    );
    for (const bad of ["not a url", "/circles/public/goals/malformed", `/circles/public/goals/${id()}`]) {
        assert.equal(await resolveInternalPreviewUrl(bad, viewerDid, dependencies()), null);
    }
}

async function testPostPreviewUsesCentralResolverAndStripsNestedIdentity() {
    let resolverCalls = 0;
    const deps = dependencies();
    const nestedUrl = `https://kamooni.test/circles/secret/goals/${id()}`;
    deps.resolvePost = async (postId: string) => {
        resolverCalls += 1;
        const context = await dependencies().resolvePost(postId);
        if (!context) return null;
        return {
            ...context,
            post: {
                ...context.post,
                content: `Original ${nestedUrl}`,
                internalPreviewType: "goal",
                internalPreviewId: id().toString(),
                internalPreviewUrl: nestedUrl,
            },
        };
    };
    const [result] = await sanitizePostNestedContent([post("post", resourceIds.post.toString())], viewerDid, deps);
    assert.equal(resolverCalls, 1);
    assert.ok(result.internalPreviewData);
    assert.equal((result.internalPreviewData as PostDisplay).content.includes(nestedUrl), false);
}

async function testSharedOriginalDepthShapeAndDeduplication() {
    const originalId = id().toString();
    const nestedId = id().toString();
    let resolverCalls = 0;
    const deps = dependencies() as ReturnType<typeof dependencies>;
    deps.resolvePost = async (postId: string) => {
        resolverCalls += 1;
        if (postId !== originalId) return null;
        return {
            post: {
                _id: originalId,
                feedId: id().toString(),
                createdBy: author.did!,
                createdAt: new Date(),
                content: "Original content",
                title: "Original title",
                reactions: { like: 99 },
                comments: 12,
                userGroups: ["private-group"],
                sharedPostId: nestedId,
                media: [{ name: "Cover", type: "image/png", fileInfo: { url: "/safe.png" } }],
            },
            feed: { _id: id(), circleId: publicCircleId.toString(), name: "Feed", handle: "default", userGroups: [] },
            circle: circleDocs.get(publicCircleId.toString())!,
        } as any;
    };
    const sharingPost = (postId: string) => ({
        ...post("post", resourceIds.post.toString()),
        _id: postId,
        internalPreviewType: undefined,
        internalPreviewId: undefined,
        internalPreviewUrl: undefined,
        sharedPostId: originalId,
        content: "Commentary remains",
    }) as PostDisplay;
    const results = await sanitizePostNestedContent([sharingPost(id().toString()), sharingPost(id().toString())], viewerDid, deps);
    assert.equal(resolverCalls, 1);
    for (const result of results) {
        assert.equal(result.content, "Commentary remains");
        assert.equal(result.sharedPostId, undefined);
        assert.deepEqual(Object.keys(result.sharedPostData!).sort(), ["author", "circleName", "content", "href", "image", "title"]);
        assert.deepEqual(result.sharedPostData, {
            content: "Original content",
            title: "Original title",
            author: { name: "Author", pictureUrl: author.picture?.url },
            circleName: "Circle",
            image: { url: "/safe.png", alt: "Cover" },
            href: `/circles/${circleDocs.get(publicCircleId.toString())!.handle}/post/${originalId}`,
        });
        const serialized = JSON.stringify(result.sharedPostData);
        assert.equal(serialized.includes(originalId), true); // canonical href only
        assert.equal(serialized.includes(nestedId), false);
        for (const forbidden of ["_id", "feedId", "sharedPostId", "sharedPostData", "reactions", "comments", "userGroups"])
            assert.equal(Object.prototype.hasOwnProperty.call(result.sharedPostData, forbidden), false);
    }
}

async function testSharedOriginalNeutralAndCycleShapes() {
    let resolverCalls = 0;
    const deps = dependencies() as ReturnType<typeof dependencies>;
    deps.resolvePost = async () => { resolverCalls += 1; return null; };
    const malformed = { ...post("post", resourceIds.post.toString()), sharedPostId: "malformed", content: "Commentary" } as PostDisplay;
    delete malformed.internalPreviewType;
    delete malformed.internalPreviewId;
    delete malformed.internalPreviewUrl;
    const missingId = id().toString();
    const missing = { ...malformed, _id: id().toString(), sharedPostId: missingId };
    const selfId = id().toString();
    const self = { ...malformed, _id: selfId, sharedPostId: selfId };
    const ordinary = { ...malformed, _id: id().toString() };
    delete ordinary.sharedPostId;
    const [bad, unavailable, cycle, plain] = await sanitizePostNestedContent([malformed, missing, self, ordinary], viewerDid, deps);
    assert.equal(resolverCalls, 2); // one missing ID and one deduplicated self ID; malformed never resolves
    for (const result of [bad, unavailable, cycle]) {
        assert.equal(result.content, "Commentary");
        assert.equal(result.sharedPostData, null);
        assert.equal(result.sharedPostId, undefined);
    }
    assert.equal(plain.sharedPostData, undefined);
    assert.equal(plain.sharedPostId, undefined);
}

async function testSharedOriginalMentionSanitization() {
    const originalId = id().toString();
    const oldLabel = "Do Not Leak This Label";
    const secretHandle = circleDocs.get(secretCircleId.toString())!.handle!;
    const makeDependencies = (memberIds: string[]) => {
        const deps = dependencies(memberIds) as ReturnType<typeof dependencies>;
        deps.resolvePost = async () => ({
            post: {
                _id: originalId,
                feedId: id().toString(),
                createdBy: author.did!,
                createdAt: new Date(),
                content: `[${oldLabel}](/circles/${secretCircleId})`,
                reactions: {}, comments: 0, userGroups: [],
                mentions: [{ type: "circle", id: secretCircleId.toString() }],
                mentionsDisplay: [{ id: secretCircleId.toString(), circle: circleDocs.get(secretCircleId.toString()) }],
            },
            feed: { _id: id(), circleId: publicCircleId.toString(), name: "Feed", handle: "default", userGroups: [] },
            circle: circleDocs.get(publicCircleId.toString())!,
        } as any);
        return deps;
    };
    const input = { ...post("post", resourceIds.post.toString()), internalPreviewType: undefined, internalPreviewId: undefined, internalPreviewUrl: undefined, sharedPostId: originalId } as PostDisplay;
    const [outsider] = await sanitizePostNestedContent([input], viewerDid, makeDependencies([]));
    assert.equal(outsider.sharedPostData?.content, "Unavailable Circle");
    const outsiderJson = JSON.stringify(outsider.sharedPostData);
    for (const forbidden of [secretCircleId.toString(), secretHandle, oldLabel, "mentions", "mentionsDisplay"]) assert.equal(outsiderJson.includes(forbidden), false);

    const [member] = await sanitizePostNestedContent([input], viewerDid, makeDependencies([secretCircleId.toString()]));
    assert.equal(member.sharedPostData?.content, `[Circle](/circles/${secretHandle})`);
    assert.equal(Object.prototype.hasOwnProperty.call(member.sharedPostData!, "mentions"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(member.sharedPostData!, "mentionsDisplay"), false);
}

function testProductionReadSeamsUseCommonSanitizer() {
    const feedSource = readFileSync("src/lib/data/feed.ts", "utf8");
    const actionSource = readFileSync("src/components/modules/feeds/actions.ts", "utf8");
    const directPageSource = readFileSync("src/app/circles/[handle]/post/[postId]/page.tsx", "utf8");
    const discussionSource = readFileSync("src/app/circles/[handle]/discussions/actions.ts", "utf8");
    const postListSource = readFileSync("src/components/modules/feeds/post-list.tsx", "utf8");
    const sharedPreviewSource = readFileSync("src/components/modules/feeds/SharedPostPreview.tsx", "utf8");
    assert.equal(feedSource.includes("fetchAndAttachInternalPreviewData"), false);
    assert.ok((feedSource.match(/sanitizePostNestedContent\(/g) ?? []).length >= 5);
    assert.match(feedSource, /getShareablePostPreview[\s\S]*resolveShareablePostPreview/);
    assert.match(actionSource, /getPostAction[\s\S]*sanitizePostNestedContent/);
    assert.match(directPageSource, /getFullPost/);
    assert.equal(feedSource.includes("fetchAndAttachSharedPostData"), false);
    assert.match(discussionSource, /listDiscussionsAction[\s\S]*sanitizePostNestedContent/);
    assert.match(discussionSource, /getDiscussionAction[\s\S]*sanitizePostNestedContent/);
    assert.match(postListSource, /post\.sharedPostData !== undefined/);
    assert.equal(sharedPreviewSource.includes("post._id"), false);
    assert.equal(sharedPreviewSource.includes("sharedPostId"), false);
    assert.match(sharedPreviewSource, /const href = post\.href/);
}

async function main() {
    await testEveryPreviewType();
    await testLifecycleAndSuperadmin();
    await testEventAllHosts();
    await testContentAndBatching();
    await testPreviewTokenBoundariesAndMentionCollision();
    await testDuplicateCirclePreviewAndMentionOwnership();
    await testLongerPreviewPrefixIsNotRewritten();
    await testInternalPreviewActionNeutralBoundary();
    await testCanonicalSinglePreviewResolverAndDtoMinimization();
    await testPostPreviewUsesCentralResolverAndStripsNestedIdentity();
    await testSharedOriginalDepthShapeAndDeduplication();
    await testSharedOriginalNeutralAndCycleShapes();
    await testSharedOriginalMentionSanitization();
    testProductionReadSeamsUseCommonSanitizer();
    console.log("post nested content policy tests passed");
}

void main();

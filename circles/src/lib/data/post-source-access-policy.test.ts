import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Event, FundingAsk, Post, Task } from "@/models/models";
import {
    buildReadablePostSourceAggregationStages,
    buildSourceFilteredPostMatchStages,
    canReadPostSource,
    getPostSourceReference,
    POST_SOURCE_TYPES,
    type PostSourceType,
} from "./post-source-access-policy";
import { buildEventNoticeboardPostData } from "@/lib/event-noticeboard-post-policy";

const viewerDid = "did:viewer";
const oid = () => new ObjectId();
const publicCircleId = oid();
const pausedCircleId = oid();
const secretCircleId = oid();
const secondSecretCircleId = oid();
const suspendedCircleId = oid();
const removedCircleId = oid();

const circle = (id: ObjectId, overrides: Partial<Circle> = {}): Circle =>
    ({ _id: id, circleType: "circle", visibility: "public", moderationStatus: "active", ...overrides }) as Circle;

const circles = new Map<string, Circle>([
    [publicCircleId.toString(), circle(publicCircleId)],
    [pausedCircleId.toString(), circle(pausedCircleId, { moderationStatus: "paused" })],
    [secretCircleId.toString(), circle(secretCircleId, { visibility: "secret" })],
    [secondSecretCircleId.toString(), circle(secondSecretCircleId, { visibility: "secret" })],
    [suspendedCircleId.toString(), circle(suspendedCircleId, { moderationStatus: "suspended" })],
    [removedCircleId.toString(), circle(removedCircleId, { moderationStatus: "removed" })],
]);

const sourceId = oid();
const sources = new Map<string, any>();
const key = (type: PostSourceType, id: ObjectId) => `${type}:${id.toString()}`;

const dependencies = (memberCircleIds: string[] = []) => ({
    findSource: async (type: PostSourceType, id: ObjectId) => sources.get(key(type, id)) ?? null,
    findCircles: async (ids: ObjectId[]) => ids.map((id) => circles.get(id.toString())).filter(Boolean) as Circle[],
    canReadOwner: async (_did: string | undefined, owner: Circle) =>
        owner.moderationStatus !== "suspended" &&
        owner.moderationStatus !== "removed" &&
        (owner.visibility !== "secret" || memberCircleIds.includes(owner._id!.toString())),
});

const post = (overrides: Partial<Post> = {}): Post =>
    ({
        _id: oid(),
        feedId: oid().toString(),
        createdBy: "did:author",
        createdAt: new Date(),
        content: "copied source text",
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
        ...overrides,
    }) as Post;

const missing = Symbol("missing");

function resolveAggregationPath(value: any, parts: string[]): any {
    if (parts.length === 0) return value;
    if (Array.isArray(value)) return value.map((item) => resolveAggregationPath(item, parts));
    const [part, ...rest] = parts;
    if (value == null || !(part in Object(value))) return missing;
    return resolveAggregationPath(value[part], rest);
}

function evaluateAggregationExpression(expression: any, document: Record<string, any>): any {
    if (typeof expression === "string" && expression.startsWith("$")) {
        return resolveAggregationPath(document, expression.slice(1).split("."));
    }
    if (Array.isArray(expression)) return expression.map((value) => evaluateAggregationExpression(value, document));
    if (!expression || typeof expression !== "object") return expression;
    if ("$arrayElemAt" in expression) {
        const [array, index] = evaluateAggregationExpression(expression.$arrayElemAt, document);
        return Array.isArray(array) && index < array.length ? array[index] : missing;
    }
    if ("$type" in expression) {
        const value = evaluateAggregationExpression(expression.$type, document);
        return value === missing ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    }
    if ("$eq" in expression) {
        const [left, right] = evaluateAggregationExpression(expression.$eq, document);
        return left === right;
    }
    if ("$or" in expression)
        return evaluateAggregationExpression(expression.$or, document).some((value: unknown) => Boolean(value));
    if ("$isArray" in expression) return Array.isArray(evaluateAggregationExpression(expression.$isArray, document));
    if ("$cond" in expression) {
        const [condition, whenTrue, whenFalse] = expression.$cond;
        return evaluateAggregationExpression(
            evaluateAggregationExpression(condition, document) ? whenTrue : whenFalse,
            document,
        );
    }
    if ("$setUnion" in expression) {
        const arrays = evaluateAggregationExpression(expression.$setUnion, document);
        return Array.from(new Set(arrays.flat()));
    }
    throw new Error(`Unsupported aggregation expression in focused test: ${JSON.stringify(expression)}`);
}

async function getAggregationEventOwnerRawIds(hostCircleIds: unknown, includeHostField = true): Promise<unknown[]> {
    const stages = await buildReadablePostSourceAggregationStages(undefined);
    const ownerStage = stages.find((stage: any) => stage.$set?.__sourceOwnerRawIds) as any;
    const eventExpression = ownerStage.$set.__sourceOwnerRawIds.$cond[1];
    const eventDoc: Record<string, unknown> = { circleId: publicCircleId.toString() };
    if (includeHostField) eventDoc.hostCircleIds = hostCircleIds;
    return evaluateAggregationExpression(eventExpression, { __sourceDocs: [eventDoc] });
}

async function canReadAggregationEventSource(
    hostCircleIds: unknown,
    memberCircleIds: string[] = [],
    includeHostField = true,
): Promise<boolean> {
    const rawIds = await getAggregationEventOwnerRawIds(hostCircleIds, includeHostField);
    const ownerIds = rawIds.map((value) =>
        typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value).toHexString() : null,
    );
    if (ownerIds.length === 0 || ownerIds.includes(null)) return false;
    return ownerIds.every((ownerId) => {
        const owner = circles.get(ownerId!);
        return Boolean(
            owner &&
                owner.moderationStatus !== "suspended" &&
                owner.moderationStatus !== "removed" &&
                (owner.visibility !== "secret" || memberCircleIds.includes(ownerId!)),
        );
    });
}

async function testSingleOwnerSources() {
    for (const type of ["task", "goal", "issue", "proposal"] as const) {
        sources.clear();
        sources.set(key(type, sourceId), { _id: sourceId, circleId: publicCircleId.toString() });
        const shadow = post({ parentItemType: type, parentItemId: sourceId.toString() });
        assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true, `${type} public source`);

        sources.set(key(type, sourceId), { _id: sourceId, circleId: secretCircleId.toString() });
        assert.equal(await canReadPostSource(shadow, "did:superadmin", dependencies()), false, `${type} superadmin`);
        assert.equal(await canReadPostSource(shadow, viewerDid, dependencies([secretCircleId.toString()])), true);

        sources.delete(key(type, sourceId));
        assert.equal(await canReadPostSource(shadow, viewerDid, dependencies([secretCircleId.toString()])), false);
        assert.equal(
            await canReadPostSource(post({ parentItemType: type, parentItemId: "bad" }), viewerDid, dependencies()),
            false,
        );
    }
}

async function testEventAllHosts() {
    sources.clear();
    const event = {
        _id: sourceId,
        circleId: publicCircleId.toString(),
        hostCircleIds: [secretCircleId.toString(), secretCircleId.toString()],
    } as Event;
    sources.set(key("event", sourceId), event);
    const shadow = post({ parentItemType: "event", parentItemId: sourceId.toString() });

    delete event.hostCircleIds;
    assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true);
    assert.equal(await canReadAggregationEventSource(undefined, [], false), true);
    event.hostCircleIds = null as any;
    assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true);
    assert.equal(await canReadAggregationEventSource(null), true);
    event.hostCircleIds = [];
    assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true);
    assert.equal(await canReadAggregationEventSource([]), true);
    event.hostCircleIds = [publicCircleId.toString(), publicCircleId.toString()];
    assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true);
    assert.deepEqual(await getAggregationEventOwnerRawIds(event.hostCircleIds), [publicCircleId.toString()]);
    assert.equal(await canReadAggregationEventSource(event.hostCircleIds), true);
    event.hostCircleIds = "malformed" as any;
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies()), false);
    assert.equal(await canReadAggregationEventSource(event.hostCircleIds), false);
    event.hostCircleIds = ["malformed"];
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies()), false);
    assert.equal(await canReadAggregationEventSource(event.hostCircleIds), false);
    event.hostCircleIds = [secretCircleId.toString(), secretCircleId.toString()];
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies()), false);
    assert.equal(await canReadAggregationEventSource(event.hostCircleIds), false);
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies([secretCircleId.toString()])), true);
    assert.equal(await canReadAggregationEventSource(event.hostCircleIds, [secretCircleId.toString()]), true);
    event.hostCircleIds = [secretCircleId.toString(), secondSecretCircleId.toString()];
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies([secretCircleId.toString()])), false);
    assert.equal(
        await canReadPostSource(
            shadow,
            viewerDid,
            dependencies([secretCircleId.toString(), secondSecretCircleId.toString()]),
        ),
        true,
    );
    event.hostCircleIds = [oid().toString()];
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies()), false);
    event.hostCircleIds = [removedCircleId.toString()];
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies()), false);
}

async function testEventNoticeboardProductionBuilder() {
    const eventId = oid();
    const data = buildEventNoticeboardPostData({
        event: {
            _id: eventId,
            title: "Event title",
            description: "Event description",
            createdBy: "did:author",
        },
        feedId: oid().toString(),
        internalPreviewUrl: `/circles/public/events/${eventId}`,
    });
    assert.ok(data);
    assert.equal(data.parentItemType, "event");
    assert.equal(data.parentItemId, eventId.toString());
    assert.equal(data.title, "Event title");
    assert.equal(data.content, "Attend this event. Event description");
}

async function testLifecycleAndLegacyVisibility() {
    sources.clear();
    sources.set(key("task", sourceId), { _id: sourceId, circleId: pausedCircleId.toString() } as Task);
    const shadow = post({ parentItemType: "task", parentItemId: sourceId.toString() });
    assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true);
    sources.set(key("task", sourceId), { _id: sourceId, circleId: suspendedCircleId.toString() } as Task);
    assert.equal(await canReadPostSource(shadow, viewerDid, dependencies()), false);
    const legacyId = oid();
    circles.set(legacyId.toString(), circle(legacyId, { visibility: undefined }));
    sources.set(key("task", sourceId), { _id: sourceId, circleId: legacyId.toString() } as Task);
    assert.equal(await canReadPostSource(shadow, undefined, dependencies()), true);
}

async function testFundingAndMarkers() {
    sources.clear();
    const legacyPostId = oid();
    sources.set(key("funding", sourceId), {
        _id: sourceId,
        circleId: publicCircleId.toString(),
        noticeboardPostId: legacyPostId.toString(),
    } as FundingAsk);
    const marked = post({ sourceResourceType: "funding", sourceResourceId: sourceId.toString() });
    const legacy = post({
        _id: legacyPostId,
        internalPreviewType: "funding",
        internalPreviewId: sourceId.toString(),
    });
    assert.equal(await canReadPostSource(marked, undefined, dependencies()), true);
    assert.equal(await canReadPostSource(legacy, undefined, dependencies()), true);
    sources.set(key("funding", sourceId), {
        _id: sourceId,
        circleId: secretCircleId.toString(),
        noticeboardPostId: legacyPostId.toString(),
    } as FundingAsk);
    assert.equal(await canReadPostSource(marked, viewerDid, dependencies()), false);
    assert.equal(await canReadPostSource(marked, viewerDid, dependencies([secretCircleId.toString()])), true);
    assert.equal(
        await canReadPostSource(
            post({ internalPreviewType: "funding", internalPreviewId: "forged" }),
            viewerDid,
            dependencies(),
        ),
        true,
        "malformed browser preview data does not become a trusted Funding source marker",
    );
    assert.equal(
        await canReadPostSource(
            post({ internalPreviewType: "funding", internalPreviewId: sourceId.toString() }),
            viewerDid,
            dependencies([secretCircleId.toString()]),
        ),
        true,
        "a browser-shaped funding preview remains an ordinary Post rather than a trusted noticeboard Post",
    );
    assert.equal(marked.parentItemType, undefined);
    assert.deepEqual(getPostSourceReference(marked), {
        type: "funding",
        id: sourceId.toString(),
        marker: "funding",
    });
}

async function testInconsistentMarkersAndOrdinaryPosts() {
    assert.equal(getPostSourceReference(post()), null);
    assert.equal(await canReadPostSource(post(), undefined, dependencies()), true);
    assert.equal(await canReadPostSource(post({ parentItemType: "task" }), viewerDid, dependencies()), false);
    assert.equal(
        await canReadPostSource(
            post({ parentItemType: "task", internalPreviewId: sourceId.toString() }),
            viewerDid,
            dependencies(),
        ),
        false,
    );
    assert.equal(
        await canReadPostSource(
            post({ parentItemType: "event", parentItemId: "malformed", internalPreviewId: sourceId.toString() }),
            viewerDid,
            dependencies(),
        ),
        false,
    );
    assert.equal(
        await canReadPostSource(post({ parentItemId: sourceId.toString() }), viewerDid, dependencies()),
        false,
    );
    assert.equal(
        await canReadPostSource(
            post({ parentItemType: "unsupported" as Post["parentItemType"], parentItemId: sourceId.toString() }),
            viewerDid,
            dependencies(),
        ),
        false,
    );
    assert.equal(
        getPostSourceReference(post({ internalPreviewType: "task", internalPreviewId: sourceId.toString() })),
        null,
    );
}

async function testProductionAggregationStages() {
    const stages = await buildReadablePostSourceAggregationStages(undefined);
    const lookupCollections = stages.flatMap((stage: any) => (stage.$lookup ? [stage.$lookup.from] : []));
    assert.deepEqual(lookupCollections, [
        ...POST_SOURCE_TYPES.map(
            (type) =>
                ({
                    task: "tasks",
                    event: "events",
                    goal: "goals",
                    issue: "issues",
                    proposal: "proposals",
                    funding: "fundingAsks",
                })[type],
        ),
        "circles",
    ]);
    const prefix = await buildSourceFilteredPostMatchStages({ feedId: { $in: ["feed"] } }, undefined);
    assert.deepEqual(prefix[0], { $match: { feedId: { $in: ["feed"] } } });
    assert.ok(prefix.slice(1).some((stage: any) => stage.$match?.$expr));
    const paginationPipeline = [...prefix, { $sort: { createdAt: -1 } }, { $skip: 0 }, { $limit: 5 }];
    const sourceGateIndex = paginationPipeline.findIndex((stage: any) => stage.$match?.$expr);
    assert.ok(sourceGateIndex > 0 && sourceGateIndex < paginationPipeline.findIndex((stage: any) => stage.$limit));
    const markerStage = stages.find((stage: any) => stage.$set?.__sourceId) as any;
    assert.equal(markerStage.$set.__sourceId.$convert.input.$cond[1], "$parentItemId");
}

async function main() {
    await testSingleOwnerSources();
    await testEventAllHosts();
    await testEventNoticeboardProductionBuilder();
    await testLifecycleAndLegacyVisibility();
    await testFundingAndMarkers();
    await testInconsistentMarkersAndOrdinaryPosts();
    await testProductionAggregationStages();
    console.log("post source access policy tests passed");
}

void main();

import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    backfillReadableEventSemanticResults,
    filterReadableEventSemanticResults,
    type EventSemanticSearchDependencies,
} from "./event-semantic-search-policy";
import type { SearchResultItem, SemanticSearchInfrastructure } from "./vdb";

let semanticSearchContent: (options: any) => Promise<SearchResultItem[]>;

const viewerDid = "did:example:viewer";
const outsiderDid = "did:example:outsider";
const circle = (visibility: unknown = "public", moderationStatus = "active") => ({
    _id: new ObjectId(),
    circleType: "circle",
    visibility,
    moderationStatus,
});
const publicCircle = circle();
const secretCircle = circle("secret");
const suspendedCircle = circle("public", "suspended");
const removedCircle = circle("public", "removed");
const allCircles = [publicCircle, secretCircle, suspendedCircle, removedCircle] as any[];
const makeEvent = (host: any, fields: Record<string, unknown> = {}) => ({
    _id: new ObjectId(),
    circleId: host._id.toString(),
    ...fields,
});

function dependencies(events: any[], memberCircleIds: string[] = [], privateEntitledIds: string[] = []) {
    const deps: EventSemanticSearchDependencies = {
        findEvents: async (ids) => {
            const wanted = new Set(ids.map(String));
            return events.filter((event) => wanted.has(event._id.toString()));
        },
        findPrivateEntitledEventIds: async (_did, ids) => ids.filter((id) => privateEntitledIds.includes(id)),
        hostPolicyDependencies: {
            findCircles: async (ids) => {
                const wanted = new Set(ids.map(String));
                return allCircles.filter((item) => wanted.has(item._id.toString()));
            },
            findMemberships: async (did, ids) =>
                memberCircleIds.filter((id) => ids.includes(id)).map((circleId) => ({ userDid: did, circleId })),
        },
    };
    return deps;
}

const hit = (event: any, score: number) => ({
    _id: event._id.toString(),
    qdrantId: `q-${event._id}`,
    type: "event",
    score,
});

const qdrantHit = (event: any, score: number, metadata: Record<string, unknown> = {}) => ({
    id: `q-${event._id}`,
    score,
    payload: { mongoId: event._id.toString(), ...metadata },
});

function semanticInfrastructure(options: {
    events: any[];
    pages?: any[][];
    memberCircleIds?: string[];
    privateEntitledIds?: string[];
    scroll?: (offset: string | number | undefined) => { points: any[]; next_page_offset?: string | number | null };
    offsets?: Array<string | number | undefined>;
}): SemanticSearchInfrastructure {
    return {
        getOpenAiClient: (() => ({
            embeddings: { create: async () => ({ data: [{ embedding: [1, 2, 3] }] }) },
        })) as any,
        getQdrantClient: (async () => ({
            search: async (_collection: string, request: any) => {
                options.offsets?.push(request.offset);
                const pageIndex = Math.floor((request.offset ?? 0) / request.limit);
                return options.pages?.[pageIndex] ?? [];
            },
            scroll: async (_collection: string, request: any) => {
                options.offsets?.push(request.offset);
                return options.scroll?.(request.offset) ?? { points: [], next_page_offset: null };
            },
        })) as any,
        eventPolicyDependencies: dependencies(options.events, options.memberCircleIds, options.privateEntitledIds),
    };
}

async function productionSemanticSearch(options: {
    infrastructure: SemanticSearchInfrastructure;
    viewerDid?: string;
    query?: string;
    limit?: number;
}) {
    return semanticSearchContent({
        query: options.query ?? "privacy query",
        categories: ["events"],
        limit: options.limit ?? 3,
        viewerDid: options.viewerDid,
        sdgHandles: options.query === "" ? ["sdg-1"] : undefined,
        dependencies: options.infrastructure,
    });
}

async function main() {
    process.env.IS_BUILD = "true";
    ({ semanticSearchContent } = await import("./vdb"));
    const readable = [
        makeEvent(publicCircle),
        makeEvent(publicCircle),
        makeEvent(publicCircle),
        makeEvent(publicCircle),
    ];
    const secret = makeEvent(secretCircle);
    const suspended = makeEvent(suspendedCircle);
    const removed = makeEvent(removedCircle);
    const malformed = makeEvent(publicCircle, { hostCircleIds: "not-an-array" });
    const privateDenied = makeEvent(publicCircle, { visibility: "private", createdBy: "did:creator" });
    const privateEntitled = makeEvent(publicCircle, { visibility: "private", createdBy: "did:creator" });
    const stale = { _id: new ObjectId() };
    const events = [...readable, secret, suspended, removed, malformed, privateDenied, privateEntitled];

    const ranked = [
        hit(secret, 100),
        hit(suspended, 99),
        hit(stale, 98),
        hit(malformed, 97),
        hit(privateDenied, 96),
        ...readable.map((event, index) => hit(event, 90 - index)),
    ];
    const pageOffsets: Array<string | number | undefined> = [];
    const backfilled = await backfillReadableEventSemanticResults({
        limit: 3,
        viewerDid: outsiderDid,
        dependencies: dependencies(events),
        fetchPage: async (offset, limit) => {
            pageOffsets.push(offset);
            // Deliberately use small transport pages to force multiple access-policy batches.
            const start = typeof offset === "number" ? offset : 0;
            const page = ranked.slice(start, start + Math.min(limit, 3));
            return { results: page, nextOffset: start + page.length, exhausted: start + page.length >= ranked.length };
        },
    });
    assert.deepEqual(
        backfilled.map((item) => item._id),
        readable.slice(0, 3).map((item) => item._id.toString()),
    );
    assert.ok(pageOffsets.length > 1, "denied and stale hits must be backfilled with later authorized hits");
    assert.deepEqual(
        backfilled.map((item) => item.score),
        [90, 89, 88],
        "authorized ranking is preserved",
    );

    const exhausted = await backfillReadableEventSemanticResults({
        limit: 3,
        viewerDid: outsiderDid,
        dependencies: dependencies([readable[0], secret]),
        fetchPage: async () => ({ results: [hit(secret, 2), hit(readable[0], 1)], exhausted: true }),
    });
    assert.deepEqual(
        exhausted.map((item) => item._id),
        [readable[0]._id.toString()],
    );

    assert.deepEqual(await filterReadableEventSemanticResults([hit(secret, 1)], undefined, dependencies([secret])), []);
    assert.deepEqual(
        await filterReadableEventSemanticResults([hit(secret, 1)], outsiderDid, dependencies([secret])),
        [],
    );
    assert.equal(
        (
            await filterReadableEventSemanticResults(
                [hit(secret, 1)],
                viewerDid,
                dependencies([secret], [secretCircle._id.toString()]),
            )
        ).length,
        1,
    );
    assert.deepEqual(
        await filterReadableEventSemanticResults([hit(secret, 1)], "did:example:superadmin", dependencies([secret])),
        [],
    );
    for (const denied of [suspended, removed, malformed]) {
        assert.deepEqual(
            await filterReadableEventSemanticResults([hit(denied, 1)], viewerDid, dependencies([denied])),
            [],
        );
    }
    assert.deepEqual(await filterReadableEventSemanticResults([hit(stale, 1)], viewerDid, dependencies([])), []);
    assert.deepEqual(
        await filterReadableEventSemanticResults([hit(privateDenied, 1)], undefined, dependencies([privateDenied])),
        [],
    );
    assert.deepEqual(
        await filterReadableEventSemanticResults([hit(privateDenied, 1)], viewerDid, dependencies([privateDenied])),
        [],
    );
    assert.equal(
        (
            await filterReadableEventSemanticResults(
                [hit(privateEntitled, 1)],
                viewerDid,
                dependencies([privateEntitled], [], [privateEntitled._id.toString()]),
            )
        ).length,
        1,
    );

    const vdbSource = await import("node:fs/promises").then((fs) => fs.readFile("src/lib/data/vdb.ts", "utf8"));
    assert.doesNotMatch(vdbSource, /console\.log\(["']Search hit:/, "raw Qdrant hits must not be logged");

    const deniedFirstPage = Array.from({ length: 20 }, (_, index) =>
        makeEvent(index % 2 ? secretCircle : suspendedCircle),
    );
    const laterReadable = readable.slice(0, 3);
    const integrationOffsets: Array<string | number | undefined> = [];
    const integrated = await productionSemanticSearch({
        viewerDid: outsiderDid,
        infrastructure: semanticInfrastructure({
            events: [...deniedFirstPage, ...laterReadable],
            pages: [
                deniedFirstPage.map((item, index) => qdrantHit(item, 200 - index, { title: "raw denied metadata" })),
                laterReadable.map((item, index) => qdrantHit(item, 100 - index)),
            ],
            offsets: integrationOffsets,
        }),
    });
    assert.deepEqual(integrationOffsets, [0, 20], "real Qdrant search adapter must advance numeric offsets");
    assert.deepEqual(
        integrated.map((item) => item._id),
        laterReadable.map((item) => item._id.toString()),
    );
    assert.deepEqual(
        integrated.map((item) => item.score),
        [100, 99, 98],
        "production ranking is preserved",
    );

    const staleFirstPage = Array.from({ length: 20 }, () => ({ _id: new ObjectId() }));
    const staleBackfill = await productionSemanticSearch({
        limit: 1,
        viewerDid: outsiderDid,
        infrastructure: semanticInfrastructure({
            events: [readable[0]],
            pages: [staleFirstPage.map((item, index) => qdrantHit(item, 50 - index)), [qdrantHit(readable[0], 1)]],
        }),
    });
    assert.deepEqual(
        staleBackfill.map((item) => item._id),
        [readable[0]._id.toString()],
    );

    const exhaustedIntegration = await productionSemanticSearch({
        viewerDid: outsiderDid,
        infrastructure: semanticInfrastructure({
            events: [secret, readable[0]],
            pages: [[qdrantHit(secret, 2), qdrantHit(readable[0], 1)]],
        }),
    });
    assert.deepEqual(
        exhaustedIntegration.map((item) => item._id),
        [readable[0]._id.toString()],
    );

    const actualVisibilityCases = [
        { event: secret, viewerDid: undefined, visible: false },
        { event: secret, viewerDid: outsiderDid, visible: false },
        { event: secret, viewerDid, memberCircleIds: [secretCircle._id.toString()], visible: true },
        { event: secret, viewerDid: "did:example:superadmin", visible: false },
        { event: suspended, viewerDid, visible: false },
        { event: removed, viewerDid, visible: false },
        { event: malformed, viewerDid, visible: false },
        { event: privateDenied, viewerDid: undefined, visible: false },
        { event: privateDenied, viewerDid, visible: false },
        {
            event: privateEntitled,
            viewerDid,
            privateEntitledIds: [privateEntitled._id.toString()],
            visible: true,
        },
    ];
    for (const testCase of actualVisibilityCases) {
        const result = await productionSemanticSearch({
            viewerDid: testCase.viewerDid,
            limit: 1,
            infrastructure: semanticInfrastructure({
                events: [testCase.event],
                pages: [[qdrantHit(testCase.event, 1)]],
                memberCircleIds: testCase.memberCircleIds,
                privateEntitledIds: testCase.privateEntitledIds,
            }),
        });
        assert.equal(result.length === 1, testCase.visible);
    }

    for (const cursorSequence of [
        ["same", "same"],
        ["a", "b", "a"],
    ]) {
        let calls = 0;
        const rawMetadata = "private title that must not be logged";
        const errors: unknown[][] = [];
        const originalError = console.error;
        console.error = (...args: unknown[]) => errors.push(args);
        try {
            const cycled = await productionSemanticSearch({
                query: "",
                viewerDid: outsiderDid,
                limit: 1,
                infrastructure: semanticInfrastructure({
                    events: [secret],
                    scroll: () => ({
                        points: [qdrantHit(secret, 0, { title: rawMetadata })],
                        next_page_offset: cursorSequence[Math.min(calls++, cursorSequence.length - 1)],
                    }),
                }),
            });
            assert.deepEqual(cycled, [], "repeated/cycling cursors fail safely");
            assert.ok(calls <= cursorSequence.length + 1, "cycling cursor must terminate in bounded calls");
        } finally {
            console.error = originalError;
        }
        assert.equal(JSON.stringify(errors).includes(rawMetadata), false, "raw denied metadata must not be logged");
    }
    console.log("event semantic search policy tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

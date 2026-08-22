import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { v5 as uuidv5 } from "uuid";
import {
    deleteDerivedResourceVectors,
    deleteRawVectorPoints,
    DERIVED_VECTOR_CONFIG,
    getDerivedVectorPointId,
    publishEligibleDerivedResourceVectors,
    reconcileDerivedResourceVectorBatch,
    runDerivedResourceVectorSafeMutation,
    type DerivedVectorKind,
} from "./derived-vector-publication";
import {
    filterDerivedResourcesForPublicVectorIndex,
    getDerivedCanonicalResourceProjection,
    getAuthoritativeOwnerCircleIds,
    resolveEligibleDerivedResourcesWithCanonicalOwners,
} from "./derived-vector-ownership";
import {
    deleteCircleAfterPublicVectorPurge,
    findDerivedResourceIdsForCircle,
    purgeDerivedPublicVectorsForCircle,
    reconcileSecretOwnedDerivedPublicVectors,
} from "./derived-vector-reconciliation";

const id = () => new ObjectId();
const publicCircle = { _id: id(), circleType: "circle", visibility: "public" } as any;
const legacyCircle = { _id: id(), circleType: "circle" } as any;
const secretCircle = { _id: id(), circleType: "circle", visibility: "secret" } as any;
const secretProject = { _id: id(), circleType: "project", visibility: "secret" } as any;
const rawSecretUser = { _id: id(), circleType: "user", visibility: "secret" } as any;

const resource = (circleId: unknown) => ({ _id: id(), circleId }) as any;

async function testOwnership() {
    for (const kind of ["tasks", "goals", "issues", "proposals"] as DerivedVectorKind[]) {
        assert.equal(
            filterDerivedResourcesForPublicVectorIndex(kind, [resource(publicCircle._id.toString())], [publicCircle])
                .length,
            1,
        );
        assert.equal(
            filterDerivedResourcesForPublicVectorIndex(kind, [resource(legacyCircle._id.toString())], [legacyCircle])
                .length,
            1,
        );
        assert.equal(
            filterDerivedResourcesForPublicVectorIndex(kind, [resource(secretCircle._id.toString())], [secretCircle])
                .length,
            0,
        );
        assert.equal(
            filterDerivedResourcesForPublicVectorIndex(kind, [resource(rawSecretUser._id.toString())], [rawSecretUser])
                .length,
            1,
        );
        assert.equal(filterDerivedResourcesForPublicVectorIndex(kind, [resource("bad")], []).length, 0);
        assert.equal(filterDerivedResourcesForPublicVectorIndex(kind, [resource(id().toString())], []).length, 0);
    }

    const publicFeed = { _id: id(), circleId: publicCircle._id.toString() } as any;
    const secretFeed = { _id: id(), circleId: secretCircle._id.toString() } as any;
    const publicPost = { _id: id(), feedId: publicFeed._id.toString() } as any;
    const secretPost = { _id: id(), feedId: secretFeed._id.toString(), content: "secret post text" } as any;
    assert.deepEqual(filterDerivedResourcesForPublicVectorIndex("posts", [publicPost], [publicCircle], [publicFeed]), [
        publicPost,
    ]);
    assert.equal(
        filterDerivedResourcesForPublicVectorIndex("posts", [secretPost], [secretCircle], [secretFeed]).length,
        0,
    );
    assert.equal(
        filterDerivedResourcesForPublicVectorIndex(
            "posts",
            [publicPost],
            [publicCircle, secretCircle],
            [publicFeed],
            new Map([[publicPost._id.toString(), [secretCircle._id.toString()]]]),
        ).length,
        0,
    );
    assert.equal(
        filterDerivedResourcesForPublicVectorIndex(
            "posts",
            [{ _id: id(), feedId: id().toString() } as any],
            [publicCircle],
        ).length,
        0,
    );

    const allPublic = {
        _id: id(),
        circleId: publicCircle._id.toString(),
        hostCircleIds: [rawSecretUser._id.toString()],
    } as any;
    const mixed = {
        _id: id(),
        circleId: publicCircle._id.toString(),
        hostCircleIds: [secretProject._id.toString()],
    } as any;
    assert.equal(
        filterDerivedResourcesForPublicVectorIndex("events", [allPublic], [publicCircle, rawSecretUser]).length,
        1,
    );
    assert.equal(
        filterDerivedResourcesForPublicVectorIndex("events", [mixed], [publicCircle, secretProject]).length,
        0,
    );
    assert.equal(getAuthoritativeOwnerCircleIds("events", { ...allPublic, hostCircleIds: ["bad"] }), null);
}

async function testPublication() {
    for (const kind of Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]) {
        const publicResource = { _id: id(), text: "public" };
        const secretResource = { _id: id(), text: "secret" };
        const calls: string[] = [];
        const eligibleIds = new Set([publicResource._id.toString()]);
        const resourcesById = new Map([publicResource, secretResource].map((item) => [item._id.toString(), item]));
        await publishEligibleDerivedResourceVectors([publicResource, secretResource], {
            loadEligibleCanonicalResources: async (ids) =>
                ids.filter((value) => eligibleIds.has(value)).map((value) => resourcesById.get(value)!),
            preparePublication: async () => {
                (calls as string[]).push("prepare");
            },
            formatResource: (item) => {
                calls.push(`format:${item.text}`);
                return item.text;
            },
            embedTexts: async (texts) => {
                calls.push(`embed:${texts.join()}`);
                return texts.map(() => [1]);
            },
            buildPoint: (item) => ({ id: item._id.toString() }),
            upsertPoints: async () => {
                (calls as string[]).push("upsert");
            },
            deleteResources: async () => {
                (calls as string[]).push("delete");
            },
            assertResourcesAbsent: async () => {
                (calls as string[]).push("verify");
            },
        });
        assert.deepEqual(calls, ["delete", "verify", "prepare", "format:public", "embed:public", "upsert"]);

        calls.length = 0;
        await publishEligibleDerivedResourceVectors([secretResource], {
            loadEligibleCanonicalResources: async () => [],
            preparePublication: async () => {
                calls.push("prepare");
            },
            formatResource: () => {
                calls.push("format");
                return "secret";
            },
            embedTexts: async () => {
                calls.push("embed");
                return [];
            },
            buildPoint: () => ({}),
            upsertPoints: async () => {
                calls.push("upsert");
            },
            deleteResources: async () => {
                calls.push("delete");
            },
            assertResourcesAbsent: async () => {
                calls.push("verify");
            },
        });
        assert.deepEqual(calls, ["delete", "verify"]);

        calls.length = 0;
        let load = 0;
        await publishEligibleDerivedResourceVectors([publicResource], {
            loadEligibleCanonicalResources: async () => (++load === 1 ? [publicResource] : []),
            preparePublication: async () => {
                (calls as string[]).push("prepare");
            },
            formatResource: (item) => item.text,
            embedTexts: async () => [[1]],
            buildPoint: () => ({}),
            upsertPoints: async () => {
                (calls as string[]).push("upsert");
            },
            deleteResources: async () => {
                (calls as string[]).push("delete");
            },
            assertResourcesAbsent: async () => {
                (calls as string[]).push("verify");
            },
        });
        assert.deepEqual(calls, ["prepare", "upsert", "delete", "verify"]);
    }

    const publicResource = { _id: id(), text: "public" };
    const calls: string[] = [];
    await assert.rejects(
        () =>
            publishEligibleDerivedResourceVectors([publicResource], {
                loadEligibleCanonicalResources: async () => [publicResource],
                preparePublication: async () => {
                    calls.push("prepare");
                    throw new Error("disabled");
                },
                formatResource: () => {
                    calls.push("format");
                    return "public";
                },
                embedTexts: async () => {
                    calls.push("embed");
                    return [[1]];
                },
                buildPoint: () => ({}),
                upsertPoints: async () => {
                    calls.push("upsert");
                },
                deleteResources: async () => {},
                assertResourcesAbsent: async () => {},
            }),
        /disabled/,
    );
    assert.deepEqual(calls, ["prepare"]);
}

async function testDeleteAndRebuild() {
    const resourceId = id().toString();
    const calls: unknown[] = [];
    await deleteDerivedResourceVectors("posts", [resourceId, resourceId, "bad"], {
        deletePoints: async (points, options) => {
            calls.push(points, options);
        },
    });
    assert.deepEqual(calls, [[uuidv5(resourceId, DERIVED_VECTOR_CONFIG.posts.namespace)], { wait: true }]);
    assert.equal(
        getDerivedVectorPointId("tasks", resourceId),
        uuidv5(resourceId, DERIVED_VECTOR_CONFIG.tasks.namespace),
    );
    calls.length = 0;
    await deleteDerivedResourceVectors("posts", [], {
        deletePoints: async () => {
            (calls as unknown[]).push("delete");
        },
    });
    assert.deepEqual(calls, []);
    const rawPointCalls: unknown[] = [];
    await deleteRawVectorPoints(["raw", "raw", 42], {
        deletePoints: async (pointIds, options) => {
            rawPointCalls.push(pointIds, options);
        },
    });
    assert.deepEqual(rawPointCalls, [["raw", 42], { wait: true }]);

    const visible = { _id: id() };
    const hidden = { _id: id() };
    await reconcileDerivedResourceVectorBatch([visible, hidden], {
        loadEligibleCanonicalResources: async () => [visible],
        deleteResources: async () => {
            (calls as unknown[]).push("delete");
        },
        assertResourcesAbsent: async () => {
            (calls as unknown[]).push("verify");
        },
        upsertResources: async () => {
            (calls as unknown[]).push("upsert");
        },
    });
    assert.deepEqual(calls, ["delete", "verify", "upsert"]);
    await assert.rejects(
        () =>
            reconcileDerivedResourceVectorBatch([hidden], {
                loadEligibleCanonicalResources: async () => [],
                deleteResources: async () => {
                    throw new Error("delete failed");
                },
                assertResourcesAbsent: async () => {},
                upsertResources: async () => {
                    throw new Error("must not run");
                },
            }),
        /delete failed/,
    );
}

async function testGlobalReconciliation() {
    const ids = Object.fromEntries(
        (Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]).map((kind) => [kind, id().toString()]),
    ) as Record<DerivedVectorKind, string>;
    const calls: string[] = [];
    let page = 0;
    const counts = await reconcileSecretOwnedDerivedPublicVectors({
        loadResourceIds: async (kind) => [ids[kind]],
        loadEligibleIds: async () => [],
        deleteResources: async (kind) => {
            calls.push(`delete:${kind}`);
        },
        assertResourcesAbsent: async (kind) => {
            calls.push(`verify:${kind}`);
        },
        scrollPoints: async (kind) => {
            page += 1;
            return page % 2 === 1
                ? {
                      points: [
                          { pointId: "existing", mongoId: ids[kind] },
                          { pointId: "orphan", mongoId: id().toString() },
                      ],
                      nextOffset: 2,
                  }
                : { points: [], nextOffset: null };
        },
    });
    for (const kind of Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]) assert.equal(counts[kind], 2);
    assert.equal(calls.length, 24);

    const purgeCalls: string[] = [];
    const purgeCounts = await purgeDerivedPublicVectorsForCircle(id().toString(), {
        findResourceIds: async () =>
            Object.fromEntries(
                (Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]).map((kind) => [kind, [ids[kind]]]),
            ) as Record<DerivedVectorKind, string[]>,
        deleteResources: async (kind) => {
            purgeCalls.push(`delete:${kind}`);
        },
        assertResourcesAbsent: async (kind) => {
            purgeCalls.push(`verify:${kind}`);
        },
    });
    for (const kind of Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]) assert.equal(purgeCounts[kind], 1);
    assert.equal(purgeCalls.length, 12);
}

async function testRawPointReconciliation() {
    const existingPublicId = id().toString();
    const existingSecretId = id().toString();
    const orphanId = id().toString();
    const rawDeletes: Array<{ kind: DerivedVectorKind; ids: Array<string | number> }> = [];
    const rawVerifies: Array<{ kind: DerivedVectorKind; ids: Array<string | number> }> = [];
    const mongoDeletes: string[][] = [];
    const offsets: Array<string | number | undefined> = [];
    let page = 0;
    const counts = await reconcileSecretOwnedDerivedPublicVectors({
        loadResourceIds: async (kind) => (kind === "posts" ? [existingPublicId, existingSecretId] : []),
        loadEligibleIds: async (kind) => (kind === "posts" ? [existingPublicId] : []),
        deleteResources: async (_kind, ids) => {
            mongoDeletes.push(ids);
        },
        assertResourcesAbsent: async () => {},
        deleteRawPoints: async (kind, ids) => {
            rawDeletes.push({ kind, ids });
        },
        assertRawPointsAbsent: async (kind, ids) => {
            rawVerifies.push({ kind, ids });
        },
        scrollPoints: async (kind, offset) => {
            if (kind !== "posts") return { points: [], nextOffset: null };
            offsets.push(offset);
            page += 1;
            if (page === 1) {
                return {
                    points: [
                        { pointId: "public-point", mongoId: existingPublicId },
                        { pointId: "missing-payload" },
                        { pointId: "malformed-payload", mongoId: "not-an-object-id" },
                        { pointId: 42, mongoId: 42 },
                    ],
                    nextOffset: "page-2",
                };
            }
            return {
                points: [
                    { pointId: "secret-point", mongoId: existingSecretId },
                    { pointId: "orphan-point", mongoId: orphanId },
                ],
                nextOffset: null,
            };
        },
    });
    assert.deepEqual(offsets, [undefined, "page-2"]);
    assert.deepEqual(rawDeletes, [
        { kind: "posts", ids: ["missing-payload", "malformed-payload", 42] },
    ]);
    assert.deepEqual(rawVerifies, rawDeletes);
    assert.deepEqual(mongoDeletes, [[existingSecretId], [orphanId]]);
    assert.equal(counts.posts, 5);

    const rerunCalls: string[] = [];
    await reconcileSecretOwnedDerivedPublicVectors({
        loadResourceIds: async () => [existingPublicId],
        loadEligibleIds: async () => [existingPublicId],
        deleteResources: async () => {
            rerunCalls.push("delete");
        },
        assertResourcesAbsent: async () => {
            rerunCalls.push("verify");
        },
        deleteRawPoints: async () => {
            rerunCalls.push("raw-delete");
        },
        assertRawPointsAbsent: async () => {
            rerunCalls.push("raw-verify");
        },
        scrollPoints: async () => ({ points: [{ pointId: "public-point", mongoId: existingPublicId }], nextOffset: null }),
    });
    assert.deepEqual(rerunCalls, []);
}

async function testProductionPurgeLookup() {
    const circleId = id().toString();
    const feedId = id().toString();
    const ids = Object.fromEntries(
        (Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]).map((kind) => [kind, id().toString()]),
    ) as Record<DerivedVectorKind, string>;
    const filters = new Map<string, Record<string, unknown>>();
    const result = await findDerivedResourceIdsForCircle(circleId, {
        findIds: async (kind, filter) => {
            filters.set(kind, filter);
            if (kind === "feeds") return [feedId];
            return [ids[kind]];
        },
    });
    for (const kind of Object.keys(DERIVED_VECTOR_CONFIG) as DerivedVectorKind[]) {
        assert.deepEqual(result[kind], [ids[kind]]);
    }
    assert.deepEqual(filters.get("events"), {
        $or: [{ circleId }, { hostCircleIds: circleId }],
    });
    assert.deepEqual((filters.get("posts") as any).$or[0], { feedId: { $in: [feedId] } });
    for (const parentItemType of ["task", "event", "goal", "issue", "proposal"]) {
        assert.equal(
            (filters.get("posts") as any).$or.some(
                (condition: any) => condition.parentItemType === parentItemType,
            ),
            true,
        );
    }
}

async function testProductionMutationAndCircleDeletionSeams() {
    const resourceId = id().toString();
    const calls: string[] = [];
    const result = await runDerivedResourceVectorSafeMutation(
        {
            kind: "tasks",
            resourceId,
            mutate: async () => {
                calls.push("mongo-update");
                return { matchedCount: 1 };
            },
            didMutate: (value) => value.matchedCount > 0,
        },
        {
            deleteResources: async () => {
                calls.push("delete");
            },
            assertResourcesAbsent: async () => {
                calls.push("verify");
            },
            reconcileResource: async () => {
                calls.push("reconcile");
            },
        },
    );
    assert.equal(result.matchedCount, 1);
    assert.deepEqual(calls, ["delete", "verify", "mongo-update", "reconcile"]);

    for (const kind of ["posts", "tasks", "events"] as const) {
        const deleteCalls: string[] = [];
        await runDerivedResourceVectorSafeMutation(
            {
                kind,
                resourceId,
                ...(kind === "events"
                    ? {
                          beforeMutation: async () => {
                              deleteCalls.push("delete-event-auxiliary-data");
                          },
                      }
                    : {}),
                mutate: async () => {
                    deleteCalls.push("mongo-delete");
                    return { deletedCount: 1 };
                },
                didMutate: (value) => value.deletedCount > 0,
            },
            {
                deleteResources: async () => {
                    deleteCalls.push("delete");
                },
                assertResourcesAbsent: async () => {
                    deleteCalls.push("verify");
                },
                reconcileResource: async () => {
                    deleteCalls.push("reconcile");
                },
            },
        );
        assert.deepEqual(deleteCalls, [
            "delete",
            "verify",
            ...(kind === "events" ? ["delete-event-auxiliary-data"] : []),
            "mongo-delete",
            "reconcile",
        ]);
    }

    const failedEventCalls: string[] = [];
    await assert.rejects(
        runDerivedResourceVectorSafeMutation(
            {
                kind: "events",
                resourceId,
                beforeMutation: async () => {
                    failedEventCalls.push("must-not-delete-auxiliary-data");
                },
                mutate: async () => {
                    failedEventCalls.push("must-not-delete-event");
                    return { deletedCount: 1 };
                },
                didMutate: (value) => value.deletedCount > 0,
            },
            {
                deleteResources: async () => {
                    failedEventCalls.push("delete");
                },
                assertResourcesAbsent: async () => {
                    failedEventCalls.push("verify");
                    throw new Error("event vector cleanup failed");
                },
                reconcileResource: async () => {
                    failedEventCalls.push("must-not-reconcile");
                },
            },
        ),
        /event vector cleanup failed/,
    );
    assert.deepEqual(failedEventCalls, ["delete", "verify"]);

    const circleCalls: string[] = [];
    await deleteCircleAfterPublicVectorPurge(
        id().toString(),
        async () => {
            circleCalls.push("mongo-delete");
            circleCalls.push("posts-mongo-delete");
        },
        {
            deleteCircleVectors: async () => {
                circleCalls.push("circle-delete");
            },
            assertCircleVectorsAbsent: async () => {
                circleCalls.push("circle-verify");
            },
            purgeDerivedVectors: async () => {
                circleCalls.push("derived-purge");
            },
        },
    );
    assert.deepEqual(circleCalls, [
        "circle-delete",
        "circle-verify",
        "derived-purge",
        "mongo-delete",
        "posts-mongo-delete",
    ]);
    await assert.rejects(
        deleteCircleAfterPublicVectorPurge(id().toString(), async () => circleCalls.push("must-not-delete"), {
            deleteCircleVectors: async () => {},
            assertCircleVectorsAbsent: async () => {},
            purgeDerivedVectors: async () => {
                throw new Error("derived purge failed");
            },
        }),
        /derived purge failed/,
    );
    assert.equal(circleCalls.includes("must-not-delete"), false);
    await assert.rejects(
        deleteCircleAfterPublicVectorPurge(id().toString(), async () => circleCalls.push("must-not-delete"), {
            deleteCircleVectors: async () => {
                throw new Error("circle purge failed");
            },
            assertCircleVectorsAbsent: async () => {},
            purgeDerivedVectors: async () => {},
        }),
        /circle purge failed/,
    );
    assert.equal(circleCalls.includes("must-not-delete"), false);
}

async function testProductionOwnershipResolver() {
    assert.deepEqual(getDerivedCanonicalResourceProjection("posts", false), {
        _id: 1,
        feedId: 1,
        parentItemId: 1,
        parentItemType: 1,
    });
    assert.equal(getDerivedCanonicalResourceProjection("posts", true), undefined);
    const feed = { _id: id(), circleId: publicCircle._id.toString() } as any;
    const sourceTask = { _id: id(), circleId: secretCircle._id.toString() } as any;
    const shadow = {
        _id: id(),
        feedId: feed._id.toString(),
        parentItemType: "task",
        parentItemId: sourceTask._id.toString(),
    } as any;
    const ordinary = { _id: id(), feedId: feed._id.toString() } as any;
    const fundingNoticeboard = {
        _id: id(),
        feedId: feed._id.toString(),
        sourceResourceType: "funding",
        sourceResourceId: id().toString(),
    } as any;
    const dependencies = {
        findFeeds: async () => [feed],
        findSourceResources: async () => [sourceTask],
        findCircles: async () => [publicCircle, secretCircle],
    };
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners("posts", [shadow, ordinary], dependencies),
        [ordinary],
    );
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners("posts", [fundingNoticeboard], dependencies),
        [fundingNoticeboard],
        "the dedicated Funding read marker does not enter generic parent/vector ownership",
    );
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners("posts", [shadow], {
            ...dependencies,
            findSourceResources: async () => [],
        }),
        [],
    );
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners(
            "posts",
            [{ ...ordinary, feedId: "malformed" }],
            dependencies,
        ),
        [],
    );
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners("posts", [ordinary], {
            ...dependencies,
            findFeeds: async () => [],
        }),
        [],
    );

    for (const parentItemType of ["task", "event", "goal", "issue", "proposal"] as const) {
        const source = {
            _id: id(),
            circleId: publicCircle._id.toString(),
            ...(parentItemType === "event" ? { hostCircleIds: [] } : {}),
        } as any;
        const sourceShadow = {
            _id: id(),
            feedId: feed._id.toString(),
            parentItemType,
            parentItemId: source._id.toString(),
        } as any;
        assert.deepEqual(
            await resolveEligibleDerivedResourcesWithCanonicalOwners("posts", [sourceShadow], {
                findFeeds: async () => [feed],
                findSourceResources: async (requestedType) => (requestedType === parentItemType ? [source] : []),
                findCircles: async () => [publicCircle],
            }),
            [sourceShadow],
        );
    }

    const event = {
        _id: id(),
        circleId: publicCircle._id.toString(),
        hostCircleIds: [secretProject._id.toString()],
    } as any;
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners("events", [event], {
            findFeeds: async () => [],
            findSourceResources: async () => [],
            findCircles: async () => [publicCircle, secretProject],
        }),
        [],
    );
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners(
            "events",
            [{ ...event, hostCircleIds: ["malformed"] }],
            dependencies,
        ),
        [],
    );
    assert.deepEqual(
        await resolveEligibleDerivedResourcesWithCanonicalOwners("events", [event], {
            ...dependencies,
            findCircles: async () => [publicCircle],
        }),
        [],
    );

    for (const kind of ["tasks", "goals", "issues", "proposals"] as const) {
        const ownedResource = resource(publicCircle._id.toString());
        assert.deepEqual(
            await resolveEligibleDerivedResourcesWithCanonicalOwners(kind, [ownedResource], {
                findFeeds: async () => [],
                findSourceResources: async () => [],
                findCircles: async () => [publicCircle],
            }),
            [ownedResource],
        );
    }
}

async function testShadowPostCurrentOwnerRecheck() {
    const feed = { _id: id(), circleId: publicCircle._id.toString() } as any;
    const sourceTask = { _id: id(), circleId: publicCircle._id.toString() } as any;
    const shadow = {
        _id: id(),
        feedId: feed._id.toString(),
        parentItemType: "task",
        parentItemId: sourceTask._id.toString(),
        content: "copied source text",
    } as any;
    let ownerCircle = publicCircle;
    const calls: string[] = [];
    await publishEligibleDerivedResourceVectors([shadow], {
        loadEligibleCanonicalResources: async () =>
            resolveEligibleDerivedResourcesWithCanonicalOwners("posts", [shadow], {
                findFeeds: async () => [feed],
                findSourceResources: async () => [sourceTask],
                findCircles: async () => [ownerCircle],
            }),
        preparePublication: async () => {},
        formatResource: () => shadow.content,
        embedTexts: async () => [[1]],
        buildPoint: () => ({}),
        upsertPoints: async () => {
            calls.push("upsert");
            ownerCircle = { ...secretCircle, _id: publicCircle._id };
        },
        deleteResources: async () => {
            calls.push("delete");
        },
        assertResourcesAbsent: async () => {
            calls.push("verify");
        },
    });
    assert.deepEqual(calls, ["upsert", "delete", "verify"]);
}

async function main() {
    await testOwnership();
    await testPublication();
    await testDeleteAndRebuild();
    await testGlobalReconciliation();
    await testRawPointReconciliation();
    await testProductionPurgeLookup();
    await testProductionMutationAndCircleDeletionSeams();
    await testProductionOwnershipResolver();
    await testShadowPostCurrentOwnerRecheck();
    console.log("derived-vector-publication tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

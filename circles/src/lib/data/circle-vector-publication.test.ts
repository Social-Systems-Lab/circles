import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { v5 as uuidv5 } from "uuid";
import type { Circle } from "@/models/models";
import { isCircleEligibleForPublicVectorIndex } from "./circle-visibility-policy";
import {
    CIRCLE_VECTOR_NAMESPACE,
    deletePublicCircleVectors,
    getCircleVectorPointId,
    reconcilePublicCircleVectorBatch,
    upsertEligiblePublicCircleVectors,
} from "./circle-vector-publication";
import {
    getSecretCircleVectorReconciliationQuery,
    reconcileSecretCirclePublicVectors,
} from "./circle-vector-reconciliation";
import { changeCircleVisibility, type CircleVisibilityTransitionDependencies } from "./circle-visibility-transition";

const circle = (overrides: Partial<Circle> = {}): Circle => ({
    _id: new ObjectId(),
    name: "Public Circle",
    circleType: "circle",
    ...overrides,
});

assert.equal(isCircleEligibleForPublicVectorIndex(circle({ visibility: "public" })), true);
assert.equal(isCircleEligibleForPublicVectorIndex(circle({ visibility: undefined })), true);
assert.equal(isCircleEligibleForPublicVectorIndex(circle({ visibility: "secret" })), false);
assert.equal(isCircleEligibleForPublicVectorIndex(circle({ circleType: "project", visibility: "secret" })), false);
assert.equal(isCircleEligibleForPublicVectorIndex(circle({ circleType: "user", visibility: "secret" })), true);
assert.equal(isCircleEligibleForPublicVectorIndex(circle({ isPublic: false, visibility: "public" })), true);

const run = async () => {
    const publicCircle = circle({ name: "Visible text" });
    const secretCircle = circle({ name: "SECRET CIRCLE TEXT", visibility: "secret" });
    const secretProject = circle({ name: "SECRET PROJECT TEXT", circleType: "project", visibility: "secret" });
    const formatted: string[] = [];
    const embedded: string[][] = [];
    const upserted: Array<{ mongoId: string; embedding: string }> = [];
    const canonicalCircles = new Map(
        [publicCircle, secretCircle, secretProject].map((item) => [item._id!.toString(), item]),
    );
    const upsertDependencies = {
        loadCanonicalCircles: async (ids: string[]) =>
            ids.map((id) => canonicalCircles.get(id)).filter((item): item is Circle => Boolean(item)),
        preparePublication: async () => undefined,
        formatCircle: (item: Circle) => {
            formatted.push(item.name ?? "");
            return item.name ?? "";
        },
        embedTexts: async (texts: string[]) => {
            embedded.push(texts);
            return texts.map((text) => `embedding:${text}`);
        },
        buildPoint: (item: Circle, embedding: string) => ({ mongoId: item._id!.toString(), embedding }),
        upsertPoints: async (points: Array<{ mongoId: string; embedding: string }>) => {
            upserted.push(...points);
        },
        deleteCircles: async () => undefined,
        assertCirclesAbsent: async () => undefined,
    };

    const mixedResult = await upsertEligiblePublicCircleVectors(
        [secretCircle, publicCircle, secretProject],
        upsertDependencies,
    );
    assert.deepEqual(mixedResult, { eligibleCount: 1, skippedCount: 2 });
    assert.deepEqual(formatted, ["Visible text"]);
    assert.deepEqual(embedded, [["Visible text"]]);
    assert.deepEqual(upserted, [{ mongoId: publicCircle._id!.toString(), embedding: "embedding:Visible text" }]);
    assert.equal(JSON.stringify({ formatted, embedded, upserted }).includes("SECRET"), false);

    let emptyDependencyCalls = 0;
    await upsertEligiblePublicCircleVectors([secretCircle, secretProject], {
        loadCanonicalCircles: async () => [secretCircle, secretProject],
        preparePublication: async () => {
            emptyDependencyCalls += 1;
        },
        formatCircle: () => {
            emptyDependencyCalls += 1;
            return "unexpected";
        },
        embedTexts: async () => {
            emptyDependencyCalls += 1;
            return [];
        },
        buildPoint: () => {
            emptyDependencyCalls += 1;
            return {};
        },
        upsertPoints: async () => {
            emptyDependencyCalls += 1;
        },
        deleteCircles: async () => {
            emptyDependencyCalls += 1;
        },
        assertCirclesAbsent: async () => {
            emptyDependencyCalls += 1;
        },
    });
    assert.equal(emptyDependencyCalls, 0, "secret-only batches never reach formatting, embedding, or Qdrant");

    let disabledFormattingCalls = 0;
    await assert.rejects(
        upsertEligiblePublicCircleVectors([publicCircle], {
            loadCanonicalCircles: async () => [publicCircle],
            preparePublication: async () => {
                throw new Error("VDB disabled");
            },
            formatCircle: () => {
                disabledFormattingCalls += 1;
                return "unexpected";
            },
            embedTexts: async () => {
                disabledFormattingCalls += 1;
                return [];
            },
            buildPoint: () => {
                disabledFormattingCalls += 1;
                return {};
            },
            upsertPoints: async () => {
                disabledFormattingCalls += 1;
            },
            deleteCircles: async () => undefined,
            assertCirclesAbsent: async () => undefined,
        }),
        /VDB disabled/,
    );
    assert.equal(disabledFormattingCalls, 0, "disabled VDB is detected before formatting or embedding");

    let stalePrecheckWork = 0;
    await upsertEligiblePublicCircleVectors([publicCircle], {
        loadCanonicalCircles: async () => [{ ...publicCircle, visibility: "secret" }],
        preparePublication: async () => {
            stalePrecheckWork += 1;
        },
        formatCircle: () => {
            stalePrecheckWork += 1;
            return "unexpected";
        },
        embedTexts: async () => {
            stalePrecheckWork += 1;
            return [];
        },
        buildPoint: () => {
            stalePrecheckWork += 1;
            return {};
        },
        upsertPoints: async () => {
            stalePrecheckWork += 1;
        },
        deleteCircles: async () => undefined,
        assertCirclesAbsent: async () => undefined,
    });
    assert.equal(stalePrecheckWork, 0, "stale caller visibility cannot bypass the canonical precheck");

    const concurrencyOrder: string[] = [];
    let canonicalVisibility: "public" | "secret" = "public";
    let vectorExistsAfterRace = false;
    await upsertEligiblePublicCircleVectors([publicCircle], {
        loadCanonicalCircles: async (_ids, fullDocument) => {
            concurrencyOrder.push(fullDocument ? "canonical-before" : "canonical-after");
            return [{ ...publicCircle, visibility: canonicalVisibility }];
        },
        preparePublication: async () => {
            concurrencyOrder.push("prepare");
        },
        formatCircle: (item) => item.name ?? "",
        embedTexts: async () => [[1]],
        buildPoint: () => ({}),
        upsertPoints: async () => {
            concurrencyOrder.push("upsert");
            vectorExistsAfterRace = true;
            canonicalVisibility = "secret";
        },
        deleteCircles: async () => {
            concurrencyOrder.push("delete-waited");
            vectorExistsAfterRace = false;
        },
        assertCirclesAbsent: async () => {
            concurrencyOrder.push("verify-absent");
            assert.equal(vectorExistsAfterRace, false);
        },
    });
    assert.deepEqual(concurrencyOrder, [
        "canonical-before",
        "prepare",
        "upsert",
        "canonical-after",
        "delete-waited",
        "verify-absent",
    ]);
    assert.equal(vectorExistsAfterRace, false, "a Circle becoming secret during publication is purged synchronously");

    const id = new ObjectId().toHexString();
    assert.equal(getCircleVectorPointId(id), uuidv5(id, CIRCLE_VECTOR_NAMESPACE));
    const deletes: Array<{ ids: string[]; wait: true }> = [];
    const deleteDependencies = {
        deletePoints: async (ids: string[], options: { wait: true }) => {
            deletes.push({ ids, wait: options.wait });
        },
    };
    assert.deepEqual(await deletePublicCircleVectors([], deleteDependencies), { deletedCount: 0 });
    await deletePublicCircleVectors([id, id, "malformed"], deleteDependencies);
    await deletePublicCircleVectors([id], deleteDependencies);
    assert.equal(deletes.length, 2);
    assert.deepEqual(deletes[0], { ids: [getCircleVectorPointId(id)], wait: true });
    assert.deepEqual(deletes[1], deletes[0], "repeated deletion is the same idempotent operation");

    const rebuildOrder: string[] = [];
    let rebuiltEligible: Circle[] = [];
    const rawSecretUser = circle({ circleType: "user", visibility: "secret" });
    const rebuildResult = await reconcilePublicCircleVectorBatch(
        [publicCircle, secretCircle, secretProject, rawSecretUser],
        {
            deleteCircles: async (ids) => {
                rebuildOrder.push("delete");
                assert.deepEqual(ids.map(String), [secretCircle._id!.toString(), secretProject._id!.toString()]);
            },
            upsertCircles: async (circles) => {
                rebuildOrder.push("upsert");
                rebuiltEligible = circles;
            },
        },
    );
    assert.deepEqual(rebuildOrder, ["delete", "upsert"]);
    assert.deepEqual(rebuildResult, { eligibleCount: 2, purgedCount: 2 });
    assert.deepEqual(rebuiltEligible, [publicCircle, rawSecretUser]);
    await assert.rejects(
        reconcilePublicCircleVectorBatch([publicCircle, secretCircle], {
            deleteCircles: async () => {
                throw new Error("delete failed");
            },
            upsertCircles: async () => {
                throw new Error("must not upsert after failed purge");
            },
        }),
        /delete failed/,
    );

    const reconciliationDeletes: unknown[][] = [];
    const reconciliationVerifies: unknown[][] = [];
    const reconciliationResult = await reconcileSecretCirclePublicVectors({
        findSecretCircleIds: async () => [
            { _id: secretCircle._id },
            { _id: secretProject._id!.toString() },
            { _id: "malformed" },
        ],
        deleteCircles: async (ids) => {
            reconciliationDeletes.push([...ids]);
        },
        assertCirclesAbsent: async (ids) => {
            reconciliationVerifies.push([...ids]);
        },
    });
    assert.deepEqual(reconciliationResult, { matchedCount: 3, purgedCount: 2 });
    assert.deepEqual(reconciliationDeletes, reconciliationVerifies);
    const reconciliationQuery = getSecretCircleVectorReconciliationQuery();
    const reconciliationCandidates = [secretCircle, secretProject, rawSecretUser, publicCircle].filter(
        (item) =>
            item.visibility === reconciliationQuery.visibility &&
            item.circleType !== reconciliationQuery.circleType.$ne,
    );
    assert.deepEqual(reconciliationCandidates, [secretCircle, secretProject], "raw-secret user profiles are ignored");
    await reconcileSecretCirclePublicVectors({
        findSecretCircleIds: async () => [],
        deleteCircles: async (ids) => assert.deepEqual(ids, []),
        assertCirclesAbsent: async (ids) => assert.deepEqual(ids, []),
    });

    await testVisibilityTransitions();
    console.log("Circle public vector publication tests passed");
};

const testVisibilityTransitions = async () => {
    const circleId = new ObjectId().toHexString();
    const actorDid = "did:admin";

    const makeDependencies = (initialVisibility: "public" | "secret" | undefined) => {
        let stored = circle({
            _id: new ObjectId(circleId),
            ...(initialVisibility === undefined ? {} : { visibility: initialVisibility }),
        });
        const calls: string[] = [];
        let vectorExists = true;
        let failDelete = false;
        let failUpdate = false;
        let failUpsert = false;
        let failFinalVerify = false;
        let failFinalDelete = false;
        let fullReloadBehavior: "normal" | "throw" | "missing" = "normal";
        let verifyCount = 0;
        let deleteCount = 0;
        const dependencies: CircleVisibilityTransitionDependencies = {
            findCircle: async (_id, fullDocument) => {
                calls.push(fullDocument ? "find-full" : "find");
                if (fullDocument && fullReloadBehavior === "throw") throw new Error("reload failed");
                if (fullDocument && fullReloadBehavior === "missing") return null;
                return { ...stored };
            },
            isSuperAdminDid: async () => true,
            assertVisibilityEntitlement: async () => {
                calls.push("entitle");
            },
            deletePublicVectors: async () => {
                calls.push("delete");
                deleteCount += 1;
                if (failDelete) throw new Error("delete failed");
                if (failFinalDelete && deleteCount === 2) throw new Error("final delete failed");
                vectorExists = false;
            },
            assertPublicVectorsAbsent: async () => {
                calls.push("verify");
                verifyCount += 1;
                if (failFinalVerify && verifyCount === 2) throw new Error("final verification failed");
                if (vectorExists) throw new Error("vector remains");
            },
            updateVisibility: async ({ observedVisibility, visibilityWasPresent, targetVisibility }) => {
                calls.push(`mongo:${targetVisibility}`);
                if (failUpdate) return { modifiedCount: 0 };
                assert.equal(visibilityWasPresent, initialVisibility !== undefined);
                assert.equal(observedVisibility, initialVisibility);
                stored = { ...stored, visibility: targetVisibility };
                return { modifiedCount: 1 };
            },
            upsertPublicCircles: async (circles) => {
                calls.push("upsert");
                assert.equal(circles[0].visibility, "public", "canonical reloaded public Circle is indexed");
                if (failUpsert) throw new Error("upsert failed");
                vectorExists = true;
            },
            appendAuditEvent: async (event) => {
                calls.push(`audit:${event.eventType}`);
                assert.deepEqual(event.details, {
                    previousVisibility: initialVisibility ?? "public",
                    visibility: event.details.visibility,
                });
                assert.equal(
                    JSON.stringify(event).includes(stored.name ?? "Public Circle"),
                    false,
                    "audit omits Circle content",
                );
            },
        };
        return {
            dependencies,
            calls,
            getStored: () => stored,
            hasVector: () => vectorExists,
            setFailDelete: () => (failDelete = true),
            setFailUpdate: () => (failUpdate = true),
            setFailUpsert: () => (failUpsert = true),
            setFailFinalVerify: () => (failFinalVerify = true),
            setFailFinalDelete: () => (failFinalDelete = true),
            setFullReloadBehavior: (behavior: "throw" | "missing") => (fullReloadBehavior = behavior),
        };
    };

    const toSecret = makeDependencies(undefined);
    const secretResult = await changeCircleVisibility(
        { circleId, actorDid, visibility: "secret" },
        toSecret.dependencies,
    );
    assert.deepEqual(secretResult, { previousVisibility: "public", visibility: "secret", changed: true });
    assert.deepEqual(toSecret.calls, [
        "find",
        "entitle",
        "audit:circle.visibility_change_requested",
        "delete",
        "verify",
        "mongo:secret",
        "delete",
        "verify",
        "find-full",
        "audit:circle.visibility_changed",
    ]);
    assert.equal(toSecret.getStored().visibility, "secret");
    assert.equal(toSecret.hasVector(), false);

    const finalVerificationFailure = makeDependencies("public");
    finalVerificationFailure.setFailFinalVerify();
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, finalVerificationFailure.dependencies),
        /final verification failed/,
    );
    assert.equal(finalVerificationFailure.getStored().visibility, "secret", "privacy state is not reverted");

    const reloadFailure = makeDependencies("public");
    reloadFailure.setFullReloadBehavior("throw");
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, reloadFailure.dependencies),
        /reload failed/,
    );
    assert.equal(reloadFailure.getStored().visibility, "secret");
    assert.equal(reloadFailure.hasVector(), false, "mandatory cleanup completes before a failed reload is surfaced");
    assert.ok(reloadFailure.calls.lastIndexOf("verify") < reloadFailure.calls.indexOf("find-full"));
    assert.ok(
        reloadFailure.calls.indexOf("audit:circle.visibility_changed") > reloadFailure.calls.indexOf("find-full"),
        "applied audit follows mandatory cleanup and state verification attempts",
    );

    const missingReload = makeDependencies("public");
    missingReload.setFullReloadBehavior("missing");
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, missingReload.dependencies),
        /could not be verified/,
    );
    assert.equal(missingReload.hasVector(), false, "missing post-commit record cannot skip mandatory cleanup");

    const combinedFailure = makeDependencies("public");
    combinedFailure.setFailFinalDelete();
    combinedFailure.setFullReloadBehavior("throw");
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, combinedFailure.dependencies),
        (error: unknown) => {
            assert.ok(error instanceof AggregateError);
            assert.equal(
                error.errors.some((item) => String(item).includes("final delete failed")),
                true,
            );
            assert.equal(
                error.errors.some((item) => String(item).includes("reload failed")),
                true,
            );
            return true;
        },
    );
    assert.equal(combinedFailure.getStored().visibility, "secret");

    const deleteFailure = makeDependencies("public");
    deleteFailure.setFailDelete();
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, deleteFailure.dependencies),
        /delete failed/,
    );
    assert.equal(deleteFailure.getStored().visibility, "public");
    assert.equal(
        deleteFailure.calls.some((call) => call.startsWith("mongo:")),
        false,
    );

    const concurrentFailure = makeDependencies("public");
    concurrentFailure.setFailUpdate();
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, concurrentFailure.dependencies),
        /changed concurrently/,
    );
    assert.equal(concurrentFailure.getStored().visibility, "public");
    assert.equal(concurrentFailure.hasVector(), false);

    const alreadySecret = makeDependencies("secret");
    const retrySecret = await changeCircleVisibility(
        { circleId, actorDid, visibility: "secret" },
        alreadySecret.dependencies,
    );
    assert.equal(retrySecret.changed, false);
    assert.deepEqual(alreadySecret.calls.slice(-2), ["delete", "verify"]);

    const toPublic = makeDependencies("secret");
    await changeCircleVisibility({ circleId, actorDid, visibility: "public" }, toPublic.dependencies);
    assert.ok(toPublic.calls.indexOf("mongo:public") < toPublic.calls.indexOf("upsert"));
    assert.equal(toPublic.getStored().visibility, "public");
    assert.equal(toPublic.hasVector(), true);

    const alreadyPublic = makeDependencies("public");
    const retryPublic = await changeCircleVisibility(
        { circleId, actorDid, visibility: "public" },
        alreadyPublic.dependencies,
    );
    assert.equal(retryPublic.changed, false);
    assert.ok(alreadyPublic.calls.includes("find-full"));
    assert.ok(alreadyPublic.calls.includes("upsert"));

    const publicUpsertFailure = makeDependencies("secret");
    publicUpsertFailure.setFailUpsert();
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "public" }, publicUpsertFailure.dependencies),
        /upsert failed/,
    );
    assert.equal(publicUpsertFailure.getStored().visibility, "public");

    const mongoFailureBeforePublic = makeDependencies("secret");
    mongoFailureBeforePublic.setFailUpdate();
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "public" }, mongoFailureBeforePublic.dependencies),
        /changed concurrently/,
    );
    assert.equal(mongoFailureBeforePublic.calls.includes("upsert"), false);

    const unauthorized = makeDependencies("public");
    unauthorized.dependencies.isSuperAdminDid = async () => false;
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, unauthorized.dependencies),
        /superadmin/,
    );
    assert.equal(unauthorized.calls.includes("delete"), false);

    const userCircle = makeDependencies("public");
    userCircle.dependencies.findCircle = async () => circle({ _id: new ObjectId(circleId), circleType: "user" });
    await assert.rejects(
        changeCircleVisibility({ circleId, actorDid, visibility: "secret" }, userCircle.dependencies),
        /User profile circles cannot be secret|secret circle visibility/,
    );
};

run();

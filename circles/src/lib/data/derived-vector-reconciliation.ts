import { ObjectId } from "mongodb";
import { Posts, Tasks, Events, Goals, Issues, Proposals, Feeds } from "@/lib/data/db";
import {
    normalizeDerivedVectorMongoIds,
    type DerivedVectorKind,
    type RawVectorPointId,
} from "@/lib/data/derived-vector-publication";
import { loadEligibleCanonicalDerivedResources } from "@/lib/data/derived-vector-ownership";

export type DerivedVectorReconciliationCounts = Record<DerivedVectorKind, number>;

const collections = { posts: Posts, tasks: Tasks, events: Events, goals: Goals, issues: Issues, proposals: Proposals };
const kinds = Object.keys(collections) as DerivedVectorKind[];
const RECONCILIATION_BATCH_SIZE = 250;

export type DerivedVectorPointPage = {
    points: Array<{ pointId: RawVectorPointId; mongoId?: unknown }>;
    nextOffset?: string | number | null;
};

export type DerivedResourceLookupDependencies = {
    findIds: (kind: DerivedVectorKind | "feeds", filter: Record<string, unknown>) => Promise<unknown[]>;
};

const defaultResourceLookupDependencies: DerivedResourceLookupDependencies = {
    findIds: async (kind, filter) => {
        const collection = kind === "feeds" ? Feeds : collections[kind];
        return (await collection.find(filter as never, { projection: { _id: 1 } }).toArray()).map((row) => row._id);
    },
};

export async function findDerivedResourceIdsForCircle(
    circleId: string,
    dependencies: DerivedResourceLookupDependencies = defaultResourceLookupDependencies,
): Promise<Record<DerivedVectorKind, string[]>> {
    if (!ObjectId.isValid(circleId)) throw new Error("Circle not found.");
    const normalizedCircleId = new ObjectId(circleId).toHexString();
    const feedIds = normalizeDerivedVectorMongoIds(await dependencies.findIds("feeds", { circleId: normalizedCircleId }));
    const [tasks, events, goals, issues, proposals] = await Promise.all([
        dependencies.findIds("tasks", { circleId: normalizedCircleId }),
        dependencies.findIds("events", {
            $or: [{ circleId: normalizedCircleId }, { hostCircleIds: normalizedCircleId }],
        }),
        dependencies.findIds("goals", { circleId: normalizedCircleId }),
        dependencies.findIds("issues", { circleId: normalizedCircleId }),
        dependencies.findIds("proposals", { circleId: normalizedCircleId }),
    ]);
    const sourceIds = {
        task: normalizeDerivedVectorMongoIds(tasks),
        event: normalizeDerivedVectorMongoIds(events),
        goal: normalizeDerivedVectorMongoIds(goals),
        issue: normalizeDerivedVectorMongoIds(issues),
        proposal: normalizeDerivedVectorMongoIds(proposals),
    };
    const postConditions: Record<string, unknown>[] = feedIds.length ? [{ feedId: { $in: feedIds } }] : [];
    for (const [parentItemType, ids] of Object.entries(sourceIds)) {
        if (ids.length > 0) postConditions.push({ parentItemType, parentItemId: { $in: ids } });
    }
    const posts = postConditions.length ? await dependencies.findIds("posts", { $or: postConditions }) : [];
    return {
        posts: normalizeDerivedVectorMongoIds(posts),
        tasks: sourceIds.task,
        events: sourceIds.event,
        goals: sourceIds.goal,
        issues: sourceIds.issue,
        proposals: sourceIds.proposal,
    };
}

export async function purgeDerivedPublicVectorsForCircle(
    circleId: string,
    dependencies?: {
        findResourceIds: (circleId: string) => Promise<Record<DerivedVectorKind, string[]>>;
        deleteResources: (kind: DerivedVectorKind, ids: string[]) => Promise<void>;
        assertResourcesAbsent: (kind: DerivedVectorKind, ids: string[]) => Promise<void>;
    },
): Promise<DerivedVectorReconciliationCounts> {
    const defaults = dependencies ? undefined : await import("@/lib/data/vdb");
    const deps = dependencies ?? {
        findResourceIds: findDerivedResourceIdsForCircle,
        deleteResources: async (kind: DerivedVectorKind, ids: string[]) => {
            await defaults!.deleteVbdDerivedResources(kind, ids);
        },
        assertResourcesAbsent: (kind: DerivedVectorKind, ids: string[]) =>
            defaults!.assertVbdDerivedResourcesAbsent(kind, ids),
    };
    const idsByKind = await deps.findResourceIds(circleId);
    const counts = Object.fromEntries(kinds.map((kind) => [kind, 0])) as DerivedVectorReconciliationCounts;
    for (const kind of kinds) {
        const ids = normalizeDerivedVectorMongoIds(idsByKind[kind] || []);
        if (ids.length === 0) continue;
        await deps.deleteResources(kind, ids);
        await deps.assertResourcesAbsent(kind, ids);
        counts[kind] = ids.length;
    }
    return counts;
}

export async function deleteCircleAfterPublicVectorPurge<TResult>(
    circleId: string,
    deleteCircleDocument: () => Promise<TResult>,
    dependencies?: {
        deleteCircleVectors: (circleIds: string[]) => Promise<void>;
        assertCircleVectorsAbsent: (circleIds: string[]) => Promise<void>;
        purgeDerivedVectors: (circleId: string) => Promise<unknown>;
    },
): Promise<TResult> {
    if (!ObjectId.isValid(circleId)) throw new Error("Circle not found.");
    const normalizedCircleId = new ObjectId(circleId).toHexString();
    const defaults = dependencies ? undefined : await import("@/lib/data/vdb");
    const deps = dependencies ?? {
        deleteCircleVectors: async (ids: string[]) => {
            await defaults!.deleteVbdCircles(ids);
        },
        assertCircleVectorsAbsent: (ids: string[]) => defaults!.assertVbdCirclesAbsent(ids),
        purgeDerivedVectors: (id: string) => purgeDerivedPublicVectorsForCircle(id),
    };
    await deps.deleteCircleVectors([normalizedCircleId]);
    await deps.assertCircleVectorsAbsent([normalizedCircleId]);
    await deps.purgeDerivedVectors(normalizedCircleId);
    return deleteCircleDocument();
}

export async function reconcileSecretOwnedDerivedPublicVectors(dependencies?: {
    loadResourceIds: (kind: DerivedVectorKind) => Promise<unknown[]>;
    loadEligibleIds: (kind: DerivedVectorKind, ids: string[]) => Promise<string[]>;
    deleteResources: (kind: DerivedVectorKind, ids: string[]) => Promise<void>;
    assertResourcesAbsent: (kind: DerivedVectorKind, ids: string[]) => Promise<void>;
    scrollPoints?: (kind: DerivedVectorKind, offset?: string | number) => Promise<DerivedVectorPointPage>;
    deleteRawPoints?: (kind: DerivedVectorKind, pointIds: RawVectorPointId[]) => Promise<void>;
    assertRawPointsAbsent?: (kind: DerivedVectorKind, pointIds: RawVectorPointId[]) => Promise<void>;
}): Promise<DerivedVectorReconciliationCounts> {
    const defaults = dependencies ? undefined : await import("@/lib/data/vdb");
    const deps = dependencies ?? {
        loadResourceIds: async (kind: DerivedVectorKind) =>
            (await collections[kind].find({}, { projection: { _id: 1 } }).toArray()).map((row) => row._id),
        loadEligibleIds: async (kind: DerivedVectorKind, ids: string[]) =>
            normalizeDerivedVectorMongoIds(
                (await loadEligibleCanonicalDerivedResources(kind, ids, false)).map((resource) => resource._id),
            ),
        deleteResources: async (kind: DerivedVectorKind, ids: string[]) => {
            await defaults!.deleteVbdDerivedResources(kind, ids);
        },
        assertResourcesAbsent: (kind: DerivedVectorKind, ids: string[]) =>
            defaults!.assertVbdDerivedResourcesAbsent(kind, ids),
        scrollPoints: (kind: DerivedVectorKind, offset?: string | number) =>
            defaults!.scrollVbdDerivedResourcePoints(kind, offset),
        deleteRawPoints: (kind: DerivedVectorKind, pointIds: RawVectorPointId[]) =>
            defaults!.deleteVbdDerivedResourcePoints(kind, pointIds),
        assertRawPointsAbsent: (kind: DerivedVectorKind, pointIds: RawVectorPointId[]) =>
            defaults!.assertVbdDerivedResourcePointsAbsent(kind, pointIds),
    };

    const counts = Object.fromEntries(kinds.map((kind) => [kind, 0])) as DerivedVectorReconciliationCounts;
    for (const kind of kinds) {
        const ids = normalizeDerivedVectorMongoIds(await deps.loadResourceIds(kind));
        const existingIds = new Set(ids);
        for (let offset = 0; offset < ids.length; offset += RECONCILIATION_BATCH_SIZE) {
            const batch = ids.slice(offset, offset + RECONCILIATION_BATCH_SIZE);
            const eligibleIds = new Set(normalizeDerivedVectorMongoIds(await deps.loadEligibleIds(kind, batch)));
            const ineligibleIds = batch.filter((id) => !eligibleIds.has(id));
            if (ineligibleIds.length === 0) continue;
            await deps.deleteResources(kind, ineligibleIds);
            await deps.assertResourcesAbsent(kind, ineligibleIds);
            counts[kind] += ineligibleIds.length;
        }
        if (deps.scrollPoints) {
            let offset: string | number | undefined;
            do {
                const page = await deps.scrollPoints(kind, offset);
                const suspiciousPointIds = page.points
                    .filter(
                        (point) =>
                            typeof point.mongoId !== "string" ||
                            !ObjectId.isValid(point.mongoId) ||
                            new ObjectId(point.mongoId).toHexString() !== point.mongoId.toLowerCase(),
                    )
                    .map((point) => point.pointId);
                if (suspiciousPointIds.length > 0) {
                    if (!deps.deleteRawPoints || !deps.assertRawPointsAbsent) {
                        throw new Error("Raw Qdrant point cleanup is unavailable.");
                    }
                    await deps.deleteRawPoints(kind, suspiciousPointIds);
                    await deps.assertRawPointsAbsent(kind, suspiciousPointIds);
                    counts[kind] += suspiciousPointIds.length;
                }
                const orphanIds = normalizeDerivedVectorMongoIds(
                    page.points
                        .map((point) => point.mongoId)
                        .filter(
                            (mongoId): mongoId is string =>
                                typeof mongoId === "string" &&
                                ObjectId.isValid(mongoId) &&
                                !existingIds.has(new ObjectId(mongoId).toHexString()),
                        ),
                );
                if (orphanIds.length > 0) {
                    await deps.deleteResources(kind, orphanIds);
                    await deps.assertResourcesAbsent(kind, orphanIds);
                    counts[kind] += orphanIds.length;
                }
                offset = page.nextOffset ?? undefined;
            } while (offset !== undefined);
        }
    }
    return counts;
}

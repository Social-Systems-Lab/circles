import { ObjectId } from "mongodb";
import { v5 as uuidv5 } from "uuid";

export const DERIVED_VECTOR_CONFIG = {
    posts: { namespace: "425f7857-1b1b-5ddc-b797-bd12ff00023c" },
    events: { namespace: "4f2a8b6b-8d93-5e8c-bc7e-6a0c2c87c1e0" },
    proposals: { namespace: "8f991a54-2e03-5ffc-bf0f-5e7b2b92fcd1" },
    tasks: { namespace: "d3e15cc7-6df2-5102-9a3b-1b4b4b9af6e2" },
    issues: { namespace: "b4b1f58e-9b0f-53b0-9f1a-928e4fc27d8e" },
    goals: { namespace: "c6bfe6f5-6a6a-5ef6-95e9-7c8ba57a8e21" },
} as const;

export type DerivedVectorKind = keyof typeof DERIVED_VECTOR_CONFIG;
export type VectorResource = { _id?: unknown };
export type RawVectorPointId = string | number;

export const normalizeDerivedVectorMongoIds = (ids: readonly unknown[]): string[] =>
    Array.from(
        new Set(
            ids
                .map((id) => (id instanceof ObjectId ? id.toHexString() : id))
                .filter((id): id is string => typeof id === "string" && ObjectId.isValid(id))
                .map((id) => new ObjectId(id).toHexString()),
        ),
    );

export const getDerivedVectorPointId = (kind: DerivedVectorKind, resourceId: string): string =>
    uuidv5(resourceId, DERIVED_VECTOR_CONFIG[kind].namespace);

export type DerivedVectorPublicationDependencies<TResource extends VectorResource, TEmbedding, TPoint> = {
    loadEligibleCanonicalResources: (resourceIds: string[], fullDocument: boolean) => Promise<TResource[]>;
    preparePublication: () => Promise<void>;
    formatResource: (resource: TResource) => string;
    embedTexts: (texts: string[]) => Promise<TEmbedding[]>;
    buildPoint: (resource: TResource, embedding: TEmbedding) => TPoint;
    upsertPoints: (points: TPoint[]) => Promise<void>;
    deleteResources: (resourceIds: string[]) => Promise<void>;
    assertResourcesAbsent: (resourceIds: string[]) => Promise<void>;
};

const deleteAndVerify = async (
    resourceIds: string[],
    dependencies: {
        deleteResources: (resourceIds: string[]) => Promise<void>;
        assertResourcesAbsent: (resourceIds: string[]) => Promise<void>;
    },
) => {
    const errors: unknown[] = [];
    try {
        await dependencies.deleteResources(resourceIds);
    } catch (error) {
        errors.push(error);
    }
    try {
        await dependencies.assertResourcesAbsent(resourceIds);
    } catch (error) {
        errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Derived public-vector cleanup failed.");
};

export async function publishEligibleDerivedResourceVectors<TResource extends VectorResource, TEmbedding, TPoint>(
    resources: TResource[],
    dependencies: DerivedVectorPublicationDependencies<TResource, TEmbedding, TPoint>,
): Promise<{ eligibleCount: number; skippedCount: number }> {
    const candidateIds = normalizeDerivedVectorMongoIds(resources.map((resource) => resource._id));
    if (candidateIds.length === 0) return { eligibleCount: 0, skippedCount: resources.length };

    const eligible = await dependencies.loadEligibleCanonicalResources(candidateIds, true);
    const eligibleIds = new Set(normalizeDerivedVectorMongoIds(eligible.map((resource) => resource._id)));
    const ineligibleIds = candidateIds.filter((resourceId) => !eligibleIds.has(resourceId));
    if (ineligibleIds.length > 0) await deleteAndVerify(ineligibleIds, dependencies);
    if (eligible.length === 0) return { eligibleCount: 0, skippedCount: resources.length };

    await dependencies.preparePublication();
    const embeddings = await dependencies.embedTexts(eligible.map(dependencies.formatResource));
    if (embeddings.length !== eligible.length) throw new Error("Failed to generate all public resource embeddings.");

    await dependencies.upsertPoints(
        eligible.map((resource, index) => dependencies.buildPoint(resource, embeddings[index])),
    );

    const publishedIds = normalizeDerivedVectorMongoIds(eligible.map((resource) => resource._id));
    const stillEligible = await dependencies.loadEligibleCanonicalResources(publishedIds, false);
    const stillEligibleIds = new Set(normalizeDerivedVectorMongoIds(stillEligible.map((resource) => resource._id)));
    const newlyIneligible = publishedIds.filter((resourceId) => !stillEligibleIds.has(resourceId));
    if (newlyIneligible.length > 0) await deleteAndVerify(newlyIneligible, dependencies);

    return { eligibleCount: eligible.length, skippedCount: resources.length - eligible.length };
}

export async function deleteDerivedResourceVectors(
    kind: DerivedVectorKind,
    resourceIds: readonly unknown[],
    dependencies: { deletePoints: (pointIds: string[], options: { wait: true }) => Promise<void> },
): Promise<{ deletedCount: number }> {
    const normalizedIds = normalizeDerivedVectorMongoIds(resourceIds);
    if (normalizedIds.length === 0) return { deletedCount: 0 };
    await dependencies.deletePoints(
        normalizedIds.map((resourceId) => getDerivedVectorPointId(kind, resourceId)),
        { wait: true },
    );
    return { deletedCount: normalizedIds.length };
}

export async function deleteRawVectorPoints(
    pointIds: readonly RawVectorPointId[],
    dependencies: { deletePoints: (pointIds: RawVectorPointId[], options: { wait: true }) => Promise<void> },
): Promise<{ deletedCount: number }> {
    const uniquePointIds = Array.from(new Set(pointIds));
    if (uniquePointIds.length === 0) return { deletedCount: 0 };
    await dependencies.deletePoints(uniquePointIds, { wait: true });
    return { deletedCount: uniquePointIds.length };
}

export async function reconcileDerivedResourceVectorBatch<TResource extends VectorResource>(
    resources: TResource[],
    dependencies: {
        loadEligibleCanonicalResources: (resourceIds: string[], fullDocument: boolean) => Promise<TResource[]>;
        deleteResources: (resourceIds: string[]) => Promise<void>;
        assertResourcesAbsent: (resourceIds: string[]) => Promise<void>;
        upsertResources: (resources: TResource[]) => Promise<unknown>;
    },
): Promise<{ eligibleCount: number; purgedCount: number }> {
    const candidateIds = normalizeDerivedVectorMongoIds(resources.map((resource) => resource._id));
    const eligible = await dependencies.loadEligibleCanonicalResources(candidateIds, true);
    const eligibleIds = new Set(normalizeDerivedVectorMongoIds(eligible.map((resource) => resource._id)));
    const ineligibleIds = candidateIds.filter((resourceId) => !eligibleIds.has(resourceId));

    if (ineligibleIds.length > 0) await deleteAndVerify(ineligibleIds, dependencies);
    await dependencies.upsertResources(eligible);
    return { eligibleCount: eligible.length, purgedCount: ineligibleIds.length };
}

export async function runDerivedResourceVectorSafeMutation<TResult>(
    input: {
        kind: DerivedVectorKind;
        resourceId: string;
        beforeMutation?: () => Promise<void>;
        mutate: () => Promise<TResult>;
        didMutate: (result: TResult) => boolean;
    },
    dependencies?: {
        deleteResources: (kind: DerivedVectorKind, ids: string[]) => Promise<void>;
        assertResourcesAbsent: (kind: DerivedVectorKind, ids: string[]) => Promise<void>;
        reconcileResource: (kind: DerivedVectorKind, resourceId: string) => Promise<unknown>;
    },
): Promise<TResult> {
    const normalizedIds = normalizeDerivedVectorMongoIds([input.resourceId]);
    if (normalizedIds.length !== 1) throw new Error("Invalid derived resource ID.");
    const resourceId = normalizedIds[0];
    const defaults = dependencies ? undefined : await import("@/lib/data/vdb");
    const deps = dependencies ?? {
        deleteResources: async (kind: DerivedVectorKind, ids: string[]) => {
            await defaults!.deleteVbdDerivedResources(kind, ids);
        },
        assertResourcesAbsent: (kind: DerivedVectorKind, ids: string[]) =>
            defaults!.assertVbdDerivedResourcesAbsent(kind, ids),
        reconcileResource: (kind: DerivedVectorKind, id: string) => defaults!.reconcileVbdDerivedResource(kind, id),
    };
    await deps.deleteResources(input.kind, [resourceId]);
    await deps.assertResourcesAbsent(input.kind, [resourceId]);
    await input.beforeMutation?.();
    const result = await input.mutate();
    if (input.didMutate(result)) await deps.reconcileResource(input.kind, resourceId);
    return result;
}

import type { Circle } from "@/models/models";
import { isCircleEligibleForPublicVectorIndex } from "@/lib/data/circle-visibility-policy";
import { ObjectId } from "mongodb";
import { v5 as uuidv5 } from "uuid";

export const CIRCLE_VECTOR_NAMESPACE = "374c3b2f-be54-5c82-b3a1-f16f7b205cdc";

export const normalizeCircleVectorMongoIds = (circleIds: readonly unknown[]): string[] =>
    Array.from(
        new Set(
            circleIds
                .map((circleId) => (circleId instanceof ObjectId ? circleId.toHexString() : circleId))
                .filter((circleId): circleId is string => typeof circleId === "string" && ObjectId.isValid(circleId))
                .map((circleId) => new ObjectId(circleId).toHexString()),
        ),
    );

export const getCircleVectorPointId = (circleId: string): string => uuidv5(circleId, CIRCLE_VECTOR_NAMESPACE);

export type PublicCircleVectorUpsertDependencies<TEmbedding, TPoint> = {
    loadCanonicalCircles: (circleIds: string[], fullDocument: boolean) => Promise<Circle[]>;
    preparePublication: () => Promise<void>;
    formatCircle: (circle: Circle) => string;
    embedTexts: (texts: string[]) => Promise<TEmbedding[]>;
    buildPoint: (circle: Circle, embedding: TEmbedding) => TPoint;
    upsertPoints: (points: TPoint[]) => Promise<void>;
    deleteCircles: (circleIds: string[]) => Promise<void>;
    assertCirclesAbsent: (circleIds: string[]) => Promise<void>;
};

const deleteAndVerifyPublishedCircles = async (
    circleIds: string[],
    dependencies: Pick<PublicCircleVectorUpsertDependencies<unknown, unknown>, "deleteCircles" | "assertCirclesAbsent">,
): Promise<void> => {
    const errors: unknown[] = [];
    try {
        await dependencies.deleteCircles(circleIds);
    } catch (error) {
        errors.push(error);
    }
    try {
        await dependencies.assertCirclesAbsent(circleIds);
    } catch (error) {
        errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Public Circle vector cleanup failed.");
};

export async function upsertEligiblePublicCircleVectors<TEmbedding, TPoint>(
    circles: Circle[],
    dependencies: PublicCircleVectorUpsertDependencies<TEmbedding, TPoint>,
): Promise<{ eligibleCount: number; skippedCount: number }> {
    const candidateIds = normalizeCircleVectorMongoIds(circles.map((circle) => circle._id));
    if (candidateIds.length === 0) {
        return { eligibleCount: 0, skippedCount: circles.length };
    }

    const canonicalCircles = await dependencies.loadCanonicalCircles(candidateIds, true);
    const eligibleCircles = canonicalCircles.filter(isCircleEligibleForPublicVectorIndex);
    if (eligibleCircles.length === 0) {
        return { eligibleCount: 0, skippedCount: circles.length };
    }

    await dependencies.preparePublication();
    const embeddings = await dependencies.embedTexts(eligibleCircles.map(dependencies.formatCircle));
    if (embeddings.length !== eligibleCircles.length) {
        throw new Error("Failed to generate all public Circle embeddings.");
    }

    const points = eligibleCircles.map((circle, index) => dependencies.buildPoint(circle, embeddings[index]));
    await dependencies.upsertPoints(points);

    const publishedIds = normalizeCircleVectorMongoIds(eligibleCircles.map((circle) => circle._id));
    const postUpsertCircles = await dependencies.loadCanonicalCircles(publishedIds, false);
    const stillEligibleIds = new Set(
        postUpsertCircles
            .filter(isCircleEligibleForPublicVectorIndex)
            .map((circle) => circle._id?.toString())
            .filter((circleId): circleId is string => Boolean(circleId)),
    );
    const newlyIneligibleIds = publishedIds.filter((circleId) => !stillEligibleIds.has(circleId));
    if (newlyIneligibleIds.length > 0) {
        await deleteAndVerifyPublishedCircles(newlyIneligibleIds, dependencies);
    }

    return { eligibleCount: eligibleCircles.length, skippedCount: circles.length - eligibleCircles.length };
}

export type PublicCircleVectorDeleteDependencies = {
    deletePoints: (pointIds: string[], options: { wait: true }) => Promise<void>;
};

export async function deletePublicCircleVectors(
    circleIds: readonly unknown[],
    dependencies: PublicCircleVectorDeleteDependencies,
): Promise<{ deletedCount: number }> {
    const normalizedIds = normalizeCircleVectorMongoIds(circleIds);
    if (normalizedIds.length === 0) return { deletedCount: 0 };
    await dependencies.deletePoints(normalizedIds.map(getCircleVectorPointId), { wait: true });
    return { deletedCount: normalizedIds.length };
}

export type PublicCircleVectorRebuildDependencies = {
    deleteCircles: (circleIds: readonly unknown[]) => Promise<unknown>;
    upsertCircles: (circles: Circle[]) => Promise<unknown>;
};

export async function reconcilePublicCircleVectorBatch(
    circles: Circle[],
    dependencies: PublicCircleVectorRebuildDependencies,
): Promise<{ eligibleCount: number; purgedCount: number }> {
    const eligible = circles.filter(isCircleEligibleForPublicVectorIndex);
    const ineligibleIds = circles
        .filter((circle) => !isCircleEligibleForPublicVectorIndex(circle))
        .map((circle) => circle._id);

    await dependencies.deleteCircles(ineligibleIds);
    await dependencies.upsertCircles(eligible);
    return { eligibleCount: eligible.length, purgedCount: normalizeCircleVectorMongoIds(ineligibleIds).length };
}

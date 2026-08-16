import { ObjectId } from "mongodb";

export const getSecretCircleVectorReconciliationQuery = () => ({
    visibility: "secret" as const,
    circleType: { $ne: "user" as const },
});

type ReconciliationDependencies = {
    findSecretCircleIds: () => Promise<Array<{ _id?: unknown }>>;
    deleteCircles: (circleIds: readonly unknown[]) => Promise<unknown>;
    assertCirclesAbsent: (circleIds: readonly unknown[]) => Promise<void>;
};

const defaultDependencies: ReconciliationDependencies = {
    findSecretCircleIds: async () => {
        const { Circles } = await import("@/lib/data/db");
        return Circles.find(
            getSecretCircleVectorReconciliationQuery(),
            { projection: { _id: 1 } },
        ).toArray();
    },
    deleteCircles: async (circleIds) => {
        const { deleteVbdCircles } = await import("@/lib/data/vdb");
        return deleteVbdCircles(circleIds);
    },
    assertCirclesAbsent: async (circleIds) => {
        const { assertVbdCirclesAbsent } = await import("@/lib/data/vdb");
        return assertVbdCirclesAbsent(circleIds);
    },
};

export async function reconcileSecretCirclePublicVectors(
    dependencies: ReconciliationDependencies = defaultDependencies,
): Promise<{ matchedCount: number; purgedCount: number }> {
    const rows = await dependencies.findSecretCircleIds();
    const circleIds = Array.from(
        new Set(
            rows
                .map((row) => (row._id instanceof ObjectId ? row._id.toHexString() : row._id))
                .filter((circleId): circleId is string => typeof circleId === "string" && ObjectId.isValid(circleId))
                .map((circleId) => new ObjectId(circleId).toHexString()),
        ),
    );
    await dependencies.deleteCircles(circleIds);
    await dependencies.assertCirclesAbsent(circleIds);
    return { matchedCount: rows.length, purgedCount: circleIds.length };
}

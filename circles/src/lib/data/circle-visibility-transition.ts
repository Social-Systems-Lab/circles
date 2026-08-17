import type { Circle, CircleType, CircleVisibility } from "@/models/models";
import { circleVisibilitySchema } from "@/models/models";
import { getCircleVisibility } from "@/lib/data/circle-visibility-policy";
import { ObjectId } from "mongodb";

type VisibilityTransitionInput = {
    circleId: string;
    actorDid: string;
    visibility: CircleVisibility;
};

type ConditionalVisibilityUpdate = {
    circleId: string;
    observedVisibility?: CircleVisibility;
    visibilityWasPresent: boolean;
    targetVisibility: CircleVisibility;
};

export type CircleVisibilityTransitionDependencies = {
    findCircle: (circleId: string, fullDocument?: boolean) => Promise<Circle | null>;
    isSuperAdminDid: (actorDid: string) => Promise<boolean>;
    assertVisibilityEntitlement: (input: {
        actorDid: string;
        circleType?: CircleType;
        visibility: CircleVisibility;
    }) => Promise<void>;
    deletePublicVectors: (circleIds: readonly unknown[]) => Promise<unknown>;
    assertPublicVectorsAbsent: (circleIds: readonly unknown[]) => Promise<void>;
    purgeDerivedVectors: (circleId: string) => Promise<unknown>;
    updateVisibility: (input: ConditionalVisibilityUpdate) => Promise<{ modifiedCount: number }>;
    upsertPublicCircles: (circles: Circle[]) => Promise<unknown>;
    appendAuditEvent: (event: {
        eventType: string;
        actorDid: string;
        targetType: "circle";
        targetId: string;
        details: Record<string, unknown>;
    }) => Promise<unknown>;
};

const defaultDependencies: CircleVisibilityTransitionDependencies = {
    findCircle: async (circleId, fullDocument = false) => {
        const { Circles } = await import("@/lib/data/db");
        return Circles.findOne(
            { _id: new ObjectId(circleId) },
            fullDocument ? undefined : { projection: { _id: 1, circleType: 1, visibility: 1 } },
        );
    },
    isSuperAdminDid: async (actorDid) => {
        const { isSuperAdminDid } = await import("@/lib/auth/superadmin");
        return isSuperAdminDid(actorDid);
    },
    assertVisibilityEntitlement: async (input) => {
        const { assertCanSetCircleVisibility } = await import("@/lib/data/circle-visibility-policy");
        return assertCanSetCircleVisibility(input);
    },
    deletePublicVectors: async (circleIds) => {
        const { deleteVbdCircles } = await import("@/lib/data/vdb");
        return deleteVbdCircles(circleIds);
    },
    assertPublicVectorsAbsent: async (circleIds) => {
        const { assertVbdCirclesAbsent } = await import("@/lib/data/vdb");
        return assertVbdCirclesAbsent(circleIds);
    },
    purgeDerivedVectors: async (circleId) => {
        const { purgeDerivedPublicVectorsForCircle } = await import("@/lib/data/derived-vector-reconciliation");
        return purgeDerivedPublicVectorsForCircle(circleId);
    },
    updateVisibility: async ({ circleId, observedVisibility, visibilityWasPresent, targetVisibility }) => {
        const { Circles } = await import("@/lib/data/db");
        const visibilityCondition = visibilityWasPresent
            ? { visibility: observedVisibility }
            : { visibility: { $exists: false } };
        return Circles.updateOne(
            { _id: new ObjectId(circleId), ...visibilityCondition },
            { $set: { visibility: targetVisibility } },
        );
    },
    upsertPublicCircles: async (circles) => {
        const { upsertVbdCircles } = await import("@/lib/data/vdb");
        return upsertVbdCircles(circles);
    },
    appendAuditEvent: async (event) => {
        const { appendPlatformAuditEvent } = await import("@/lib/data/platform-audit");
        return appendPlatformAuditEvent(event);
    },
};

const getPersistedVisibility = (circle: Circle): CircleVisibility => {
    if (circle.circleType === "user" || circle.visibility === undefined) return getCircleVisibility(circle);
    const parsed = circleVisibilitySchema.safeParse(circle.visibility);
    if (!parsed.success) throw new Error("Circle has an invalid persisted visibility value.");
    return parsed.data;
};

export async function changeCircleVisibility(
    input: VisibilityTransitionInput,
    dependencies: CircleVisibilityTransitionDependencies = defaultDependencies,
): Promise<{ previousVisibility: CircleVisibility; visibility: CircleVisibility; changed: boolean }> {
    if (!ObjectId.isValid(input.circleId)) throw new Error("Circle not found.");
    const target = circleVisibilitySchema.safeParse(input.visibility);
    if (!target.success) throw new Error("Invalid Circle visibility.");

    const circle = await dependencies.findCircle(new ObjectId(input.circleId).toHexString());
    if (!circle) throw new Error("Circle not found.");
    if (!(await dependencies.isSuperAdminDid(input.actorDid))) {
        throw new Error("Unauthorized: superadmin access required.");
    }
    await dependencies.assertVisibilityEntitlement({
        actorDid: input.actorDid,
        circleType: circle.circleType,
        visibility: target.data,
    });
    if (circle.circleType === "user" && target.data === "secret") {
        throw new Error("User profile circles cannot be secret.");
    }

    const circleId = new ObjectId(input.circleId).toHexString();
    const previousVisibility = getPersistedVisibility(circle);
    const details = { previousVisibility, visibility: target.data };
    await dependencies.appendAuditEvent({
        eventType: "circle.visibility_change_requested",
        actorDid: input.actorDid,
        targetType: "circle",
        targetId: circleId,
        details,
    });

    if (previousVisibility === target.data) {
        if (target.data === "secret") {
            await dependencies.deletePublicVectors([circleId]);
            await dependencies.assertPublicVectorsAbsent([circleId]);
            await dependencies.purgeDerivedVectors(circleId);
        } else {
            const canonicalCircle = await dependencies.findCircle(circleId, true);
            if (!canonicalCircle || getPersistedVisibility(canonicalCircle) !== "public") {
                throw new Error("Circle visibility changed concurrently; retry the action.");
            }
            await dependencies.upsertPublicCircles([canonicalCircle]);
        }
        return { previousVisibility, visibility: target.data, changed: false };
    }

    if (target.data === "secret") {
        await dependencies.deletePublicVectors([circleId]);
        await dependencies.assertPublicVectorsAbsent([circleId]);
        await dependencies.purgeDerivedVectors(circleId);
    }

    const visibilityWasPresent = Object.prototype.hasOwnProperty.call(circle, "visibility");
    const updateResult = await dependencies.updateVisibility({
        circleId,
        observedVisibility: circle.visibility,
        visibilityWasPresent,
        targetVisibility: target.data,
    });
    if (updateResult.modifiedCount !== 1) {
        throw new Error("Circle visibility changed concurrently; retry the action.");
    }

    if (target.data === "secret") {
        const reconciliationErrors: unknown[] = [];
        try {
            await dependencies.deletePublicVectors([circleId]);
        } catch (error) {
            reconciliationErrors.push(error);
        }
        try {
            await dependencies.assertPublicVectorsAbsent([circleId]);
        } catch (error) {
            reconciliationErrors.push(error);
        }
        try {
            await dependencies.purgeDerivedVectors(circleId);
        } catch (error) {
            reconciliationErrors.push(error);
        }

        let reloadError: unknown;
        try {
            const canonicalCircle = await dependencies.findCircle(circleId, true);
            if (!canonicalCircle || getPersistedVisibility(canonicalCircle) !== "secret") {
                throw new Error("Circle visibility update could not be verified.");
            }
        } catch (error) {
            reloadError = error;
        }

        let auditError: unknown;
        try {
            await dependencies.appendAuditEvent({
                eventType: "circle.visibility_changed",
                actorDid: input.actorDid,
                targetType: "circle",
                targetId: circleId,
                details,
            });
        } catch (error) {
            auditError = error;
        }

        const postCommitErrors = [...reconciliationErrors, reloadError, auditError].filter(
            (error): error is NonNullable<unknown> => error !== undefined,
        );
        if (postCommitErrors.length === 1) throw postCommitErrors[0];
        if (postCommitErrors.length > 1) {
            throw new AggregateError(postCommitErrors, "Circle became secret but post-transition verification failed.");
        }
    } else {
        const canonicalCircle = await dependencies.findCircle(circleId, true);
        if (!canonicalCircle || getPersistedVisibility(canonicalCircle) !== target.data) {
            throw new Error("Circle visibility update could not be verified.");
        }
        await dependencies.appendAuditEvent({
            eventType: "circle.visibility_changed",
            actorDid: input.actorDid,
            targetType: "circle",
            targetId: circleId,
            details,
        });
        await dependencies.upsertPublicCircles([canonicalCircle]);
    }

    return { previousVisibility, visibility: target.data, changed: true };
}

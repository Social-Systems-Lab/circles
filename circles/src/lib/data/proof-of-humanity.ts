import { getCirclesByDids } from "@/lib/data/circle";
import { HumanityVerification, HumanityVerificationDisplay, HumanityVerificationLevel } from "@/models/models";
import { HumanityVerifications } from "./db";

HumanityVerifications?.createIndex({ subjectDid: 1, revokedAt: 1, level: 1, createdAt: -1 });
HumanityVerifications?.createIndex({ verifierDid: 1, subjectDid: 1, revokedAt: 1 });

const ACTIVE_VERIFICATION_QUERY = {
    $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
};

export type HumanityVerificationSummary = {
    realPersonCount: number;
    metInRealLifeCount: number;
    totalActiveCount: number;
    verifications: HumanityVerificationDisplay[];
    viewerVerification: HumanityVerificationDisplay | null;
    canCurrentViewerVerify: boolean;
    isOwnProfile: boolean;
};

const withStringIds = (verification: HumanityVerification): HumanityVerification => ({
    ...verification,
    _id: verification._id?.toString?.() || verification._id,
});

export async function getHumanityVerificationSummary(
    subjectDid: string,
    viewerDid?: string | null,
): Promise<HumanityVerificationSummary> {
    const activeVerifications = (await HumanityVerifications.find({
        subjectDid,
        ...ACTIVE_VERIFICATION_QUERY,
    })
        .sort({ level: -1, createdAt: -1, _id: -1 })
        .toArray()) as HumanityVerification[];

    const verifierDidSet = Array.from(new Set(activeVerifications.map((verification) => verification.verifierDid)));
    const verifiers = verifierDidSet.length ? await getCirclesByDids(verifierDidSet) : [];
    const verifierMap = new Map(verifiers.map((verifier) => [verifier.did, verifier]));

    const verifications = activeVerifications.map((verification) => ({
        ...withStringIds(verification),
        verifier: verifierMap.get(verification.verifierDid) ?? null,
    })).sort((a, b) => {
        const levelOrder = (level: HumanityVerificationLevel) => (level === "met_in_real_life" ? 0 : 1);
        return levelOrder(a.level) - levelOrder(b.level);
    });

    return {
        realPersonCount: verifications.filter((verification) => verification.level === "real_person").length,
        metInRealLifeCount: verifications.filter((verification) => verification.level === "met_in_real_life").length,
        totalActiveCount: verifications.length,
        verifications,
        viewerVerification: viewerDid
            ? verifications.find((verification) => verification.verifierDid === viewerDid) ?? null
            : null,
        canCurrentViewerVerify: Boolean(viewerDid && viewerDid !== subjectDid),
        isOwnProfile: Boolean(viewerDid && viewerDid === subjectDid),
    };
}

export async function getActiveHumanityVerification(
    verifierDid: string,
    subjectDid: string,
): Promise<HumanityVerification | null> {
    const verification = (await HumanityVerifications.findOne({
        verifierDid,
        subjectDid,
        ...ACTIVE_VERIFICATION_QUERY,
    })) as HumanityVerification | null;

    return verification ?? null;
}

export async function createOrUpdateHumanityVerification({
    verifierDid,
    subjectDid,
    level,
    note,
}: {
    verifierDid: string;
    subjectDid: string;
    level: HumanityVerificationLevel;
    note?: string;
}) {
    const now = new Date();
    const trimmedNote = note?.trim();
    const normalizedNote = trimmedNote ? trimmedNote.slice(0, 280) : undefined;
    const existing = await getActiveHumanityVerification(verifierDid, subjectDid);

    if (existing) {
        const previousLevel = existing.level;
        const update: Record<string, any> = {
            $set: {
                level,
                updatedAt: now,
            },
        };

        if (normalizedNote) {
            update.$set.note = normalizedNote;
        } else {
            update.$unset = { note: "" };
        }

        await HumanityVerifications.updateOne(
            { _id: existing._id as any },
            update,
        );

        const current = await getActiveHumanityVerification(verifierDid, subjectDid);
        const changeType =
            previousLevel === level
                ? ("updated" as const)
                : previousLevel === "real_person" && level === "met_in_real_life"
                  ? ("upgraded" as const)
                  : ("updated" as const);

        return {
            verification: current ? withStringIds(current) : null,
            changeType,
        };
    }

    const doc: HumanityVerification = {
        verifierDid,
        subjectDid,
        level,
        note: normalizedNote,
        createdAt: now,
        updatedAt: now,
    };

    const result = await HumanityVerifications.insertOne(doc);
    const created = await HumanityVerifications.findOne({ _id: result.insertedId });

    return {
        verification: created ? withStringIds(created as HumanityVerification) : null,
        changeType: "created" as const,
    };
}

export async function revokeHumanityVerification(verifierDid: string, subjectDid: string) {
    const existing = await getActiveHumanityVerification(verifierDid, subjectDid);
    if (!existing?._id) {
        return false;
    }

    await HumanityVerifications.updateOne(
        { _id: existing._id as any },
        {
            $set: {
                revokedAt: new Date(),
                updatedAt: new Date(),
            },
        },
    );

    return true;
}

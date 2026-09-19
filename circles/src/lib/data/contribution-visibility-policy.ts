import { canReadCircleByLifecycle } from "./circle-lifecycle-policy";
import { getCircleVisibility } from "./circle-visibility-policy";
import type { Circle } from "@/models/models";
import { ObjectId } from "mongodb";

/** Publication policy for general-profile contributions. This is deliberately not viewer access. */
export const isContributionSourcePubliclyVisible = (circle?: Partial<Circle> | null): boolean => {
    const circleId = circle?._id?.toString();
    if (!circleId || !ObjectId.isValid(circleId)) return false;
    if (circle?.circleType !== "circle" && circle?.circleType !== "project") return false;
    return getCircleVisibility(circle) === "public" && canReadCircleByLifecycle(circle);
};

export const filterContributionsByPublicSource = <T extends { circleId?: unknown }>(
    contributions: T[],
    sourceCircles: Array<Partial<Circle>>,
): Array<T & { circle: Partial<Circle> }> => {
    const publicSources = new Map(
        sourceCircles
            .filter(isContributionSourcePubliclyVisible)
            .map((circle) => [new ObjectId(circle._id!.toString()).toHexString(), circle]),
    );
    return contributions.flatMap((contribution) => {
        if (typeof contribution.circleId !== "string" || !ObjectId.isValid(contribution.circleId)) return [];
        const circle = publicSources.get(new ObjectId(contribution.circleId).toHexString());
        return circle ? [{ ...contribution, circle }] : [];
    });
};

export const isQualifyingProfileContribution = (
    task: {
        taskType?: unknown;
        assignedTo?: unknown;
        stage?: unknown;
        verifiedAt?: unknown;
        verifiedBy?: unknown;
        participants?: Array<{ userDid?: unknown; attendanceStatus?: unknown; attendanceVerifiedAt?: unknown }>;
    },
    userDid: string,
): boolean => {
    if (task.taskType === "shift") {
        return Boolean(
            task.participants?.some(
                (participant) =>
                    participant.userDid === userDid &&
                    participant.attendanceStatus === "attended" &&
                    participant.attendanceVerifiedAt != null,
            ),
        );
    }
    return (
        task.assignedTo === userDid && task.stage === "resolved" && task.verifiedAt != null && task.verifiedBy != null
    );
};

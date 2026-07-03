"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { canPerformRestrictedAction } from "@/lib/auth/verification";
import { features } from "@/lib/data/constants";
import { getCirclesByIds } from "@/lib/data/circle";
import { Members } from "@/lib/data/db";
import { getUserPrivate } from "@/lib/data/user";
import { Circle, Feature } from "@/models/models";

type GetSelectableCirclesActionResult = {
    success: boolean;
    circles: Circle[];
};

export async function getSelectableCirclesAction(
    moduleHandle: string,
    createFeatureHandle: string,
    requiredEnabledModuleHandle?: string,
): Promise<GetSelectableCirclesActionResult> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, circles: [] };
    }

    const user = await getUserPrivate(userDid);
    if (!canPerformRestrictedAction(user)) {
        return { success: true, circles: [] };
    }

    const memberships = await Members.find({ userDid }, { projection: { circleId: 1 } }).toArray();
    const featureToAuth = (features[moduleHandle as keyof typeof features] as any)?.[createFeatureHandle] as
        | Feature
        | undefined;

    if (!featureToAuth) {
        return { success: false, circles: [] };
    }

    const memberCircles = await getCirclesByIds(
        memberships
            .map((membership) => membership.circleId)
            .filter((circleId): circleId is string => Boolean(circleId && circleId !== user._id)),
    );
    const candidateCircles = [user as Circle, ...memberCircles].filter(
        (circle, index, circles) => circles.findIndex((candidate) => candidate._id === circle._id) === index,
    );

    const authorizationChecks = await Promise.all(
        candidateCircles.map(async (circle) => {
            if (!circle?._id || !circle.handle) {
                return false;
            }

            if (requiredEnabledModuleHandle && !circle.enabledModules?.includes(requiredEnabledModuleHandle)) {
                return false;
            }

            if (circle.circleType === "user") {
                return circle._id === user._id;
            }

            return isAuthorized(userDid, circle._id, featureToAuth);
        }),
    );

    const circles = candidateCircles
        .filter((_, index) => authorizationChecks[index])
        .sort((a, b) => {
            if (a._id === user._id) return -1;
            if (b._id === user._id) return 1;
            return (a.name || a.handle || "").localeCompare(b.name || b.handle || "");
        });

    return {
        success: true,
        circles: JSON.parse(JSON.stringify(circles)),
    };
}

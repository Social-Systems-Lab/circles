import type { Circle } from "@/models/models";
import { isProfileComplete } from "@/lib/profile-completion";

export type MapVisibleCircle = Circle & {
    mapEligibility?: {
        profileComplete?: boolean;
    };
};

export const isMapVisibleCircle = (
    circle?: (Partial<Circle> & { mapEligibility?: { profileComplete?: boolean } }) | null,
): boolean => {
    if (circle?.circleType !== "user") {
        return true;
    }

    return circle.mapEligibility?.profileComplete === true;
};

export const isServerDerivedMapVisibleCircle = (circle?: Partial<Circle> | null): boolean => {
    if (circle?.circleType !== "user") {
        return true;
    }

    return isProfileComplete(circle);
};

export const markMapEligiblePersonalProfile = (circle: Circle): MapVisibleCircle => {
    if (circle.circleType !== "user") {
        return circle;
    }

    return {
        ...circle,
        mapEligibility: {
            profileComplete: true,
        },
    };
};

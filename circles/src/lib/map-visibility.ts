import type { Circle } from "@/models/models";
import { hasRealProfileImage, hasSelectedProfileLocation } from "@/lib/profile-completion";

export type MapVisibleCircle = Circle & {
    mapEligibility?: {
        personalProfileEligible?: boolean;
    };
};

export const isMapVisibleCircle = (
    circle?: (Partial<Circle> & { mapEligibility?: { personalProfileEligible?: boolean } }) | null,
): boolean => {
    if (circle?.circleType !== "user") {
        return true;
    }

    return circle.mapEligibility?.personalProfileEligible === true;
};

export const isPersonalProfileMapEligible = (circle?: Partial<Circle> | null): boolean =>
    circle?.circleType === "user" &&
    circle.isEmailVerified === true &&
    circle.accountStatus !== "rejected" &&
    hasRealProfileImage(circle) &&
    hasSelectedProfileLocation(circle);

export const isServerDerivedMapVisibleCircle = (circle?: Partial<Circle> | null): boolean => {
    if (circle?.circleType !== "user") {
        return true;
    }

    return isPersonalProfileMapEligible(circle);
};

export const markMapEligiblePersonalProfile = (circle: Circle): MapVisibleCircle => {
    if (circle.circleType !== "user") {
        return circle;
    }

    return {
        ...circle,
        mapEligibility: {
            personalProfileEligible: true,
        },
    };
};

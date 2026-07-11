import type { Circle, CircleType } from "@/models/models";

export const isSearchEligibleCircle = (circle: Circle) => Boolean(circle.circleType);

export const buildSearchableTypeClauses = (circleTypes: CircleType[]): Record<string, unknown>[] => {
    const clauses: Record<string, unknown>[] = [];
    const nonUserTypes = circleTypes.filter((type) => type !== "user");

    if (nonUserTypes.length > 0) {
        clauses.push({ circleType: { $in: nonUserTypes } });
    }

    if (circleTypes.includes("user")) {
        clauses.push({ circleType: "user" });
    }

    return clauses;
};

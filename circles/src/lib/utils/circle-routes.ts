import type { Circle } from "@/models/models";

type CircleRouteTarget = Pick<Circle, "handle" | "enabledModules">;

export const getDefaultCircleModule = (enabledModules?: string[]): string => {
    if (enabledModules?.includes("home")) {
        return "home";
    }

    return enabledModules?.[0] ?? "home";
};

export const getCircleDefaultPath = (circle: CircleRouteTarget): string => {
    return `/circles/${circle.handle}/${getDefaultCircleModule(circle.enabledModules)}`;
};

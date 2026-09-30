import type { Circle } from "@/models/models";

declare const settingsNavigationDtoBrand: unique symbol;

export type SettingsNavigationDto = {
    handle?: string;
    circleType?: Circle["circleType"];
    readonly [settingsNavigationDtoBrand]: true;
};

export const toSettingsNavigationDto = (circle: Circle): SettingsNavigationDto =>
    ({
        handle: typeof circle.handle === "string" ? circle.handle : undefined,
        circleType: circle.circleType,
    }) as SettingsNavigationDto;

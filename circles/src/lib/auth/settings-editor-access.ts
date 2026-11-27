import type { Circle } from "@/models/models";

export const isAboutSettingsEditor = (page: unknown): page is "about" | "presence" =>
    page === "about" || page === "presence";

export const hasDelegatedAboutRule = (circle: Pick<Circle, "accessRules">): boolean =>
    circle.accessRules?.settings?.view === undefined && Array.isArray(circle.accessRules?.settings?.edit_about);

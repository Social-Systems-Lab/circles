import { cache } from "react";
import { hasDelegatedAboutRule } from "@/lib/auth/settings-editor-access";
import { getAboutEditorMode } from "@/lib/auth/settings-editor-access.server";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { isModuleEnabled } from "@/lib/auth/client-auth";
import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { features } from "@/lib/data/constants";
import { getMember } from "@/lib/data/member";
import { resolveCircleRouteAccess, type CircleRouteAccess } from "./circle-route-access";

// Layout, metadata and page share the same decision during a single request.
export const getCirclePageAccess = cache((handle: string) =>
    resolveCircleRouteAccess(handle, {
        findCircle: getCircleByHandle,
        authenticate: getAuthenticatedUserDid,
        canReadCircle,
        isCirclePublished,
        canEditAbout: (viewerDid, circleId) => isAuthorized(viewerDid, circleId, features.settings.edit_about),
    }),
);

export const getCircleSettingsAccess = cache(async (handle: string) => {
    const access = await getCirclePageAccess(handle);
    if (!access?.viewerDid) return null;
    const delegatedAboutEditor =
        access.canEditAbout &&
        hasDelegatedAboutRule(access.circle) &&
        (await getAboutEditorMode(access.circle, access.viewerDid)) === "delegated";
    return { ...access, viewerDid: access.viewerDid, delegatedAboutEditor };
});

async function canViewAboutModule(
    { circle, viewerDid }: CircleRouteAccess,
    module: "home" | "settings",
    delegated = false,
): Promise<boolean> {
    if (!circle._id || !isModuleEnabled(circle, module)) return false;
    const allowedGroups = circle.accessRules?.[module]?.view ?? features[module].view.defaultUserGroups ?? [];
    const needsDraftAdmin = !isCirclePublished(circle) && circle.createdBy !== viewerDid;
    const openToViewer = delegated || allowedGroups.includes("everyone");
    if (openToViewer && !needsDraftAdmin) return true;
    if (!viewerDid) return false;
    const groups = (await getMember(viewerDid, circle._id))?.userGroups ?? [];
    return (
        (!needsDraftAdmin || groups.includes("admins")) &&
        (openToViewer || groups.some((group) => allowedGroups.includes(group)))
    );
}

export async function getCircleHomeAccess(handle: string) {
    const access = await getCirclePageAccess(handle);
    return access && (await canViewAboutModule(access, "home")) ? access : null;
}

export async function getCircleAboutSettingsAccess(handle: string) {
    const access = await getCircleSettingsAccess(handle);
    return access && (await canViewAboutModule(access, "settings", access.delegatedAboutEditor)) ? access : null;
}

import { cache } from "react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { features } from "@/lib/data/constants";
import { resolveCircleRouteAccess } from "./circle-route-access";

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

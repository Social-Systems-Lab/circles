import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import { getMember } from "@/lib/data/member";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { createAccessPostHandler } from "./handler";
import { features } from "@/lib/data/constants";
import { isModuleEnabled } from "@/lib/auth/client-auth";

export const POST = createAccessPostHandler({
    authenticate: getAuthenticatedUserDid,
    findCircle: getCircleByHandle,
    canReadCircle,
    getMember,
    isCirclePublished,
    isModuleEnabled,
    canEditAbout: (viewerDid, circleId) => isAuthorized(viewerDid, circleId, features.settings.edit_about),
});

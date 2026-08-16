import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import { getMember } from "@/lib/data/member";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { createAccessPostHandler } from "./handler";
import { isModuleEnabled } from "@/lib/auth/client-auth";

export const POST = createAccessPostHandler({
    authenticate: getAuthenticatedUserDid,
    findCircle: getCircleByHandle,
    canReadCircle,
    getMember,
    isCirclePublished,
    isModuleEnabled,
});

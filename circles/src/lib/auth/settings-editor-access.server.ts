import { hasDelegatedAboutRule } from "./settings-editor-access";
import { isCirclePublished } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { getMember } from "@/lib/data/member";
import type { Circle } from "@/models/models";

// Call only after checking the canonical Edit About grant.
export async function getAboutEditorMode(circle: Circle, viewerDid: string): Promise<"full" | "delegated" | null> {
    if (!circle._id || (circle.circleType === "user" && circle.did !== viewerDid)) return null;

    const viewGroups = circle.accessRules?.settings?.view ?? features.settings.view.defaultUserGroups ?? [];
    const needsDraftAdmin = !isCirclePublished(circle) && circle.createdBy !== viewerDid;
    if (!needsDraftAdmin && viewGroups.includes("everyone")) return "full";

    const membership = await getMember(viewerDid, circle._id);
    const groups = membership?.userGroups ?? [];
    if (needsDraftAdmin && !groups.includes("admins")) return null;
    if (viewGroups.includes("everyone") || viewGroups.some((group) => groups.includes(group))) return "full";
    return hasDelegatedAboutRule(circle) ? "delegated" : null;
}

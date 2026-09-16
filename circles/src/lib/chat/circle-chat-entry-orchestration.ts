import type { Circle } from "@/models/models";
import { isValidCircleChatOwner } from "./conversation-access-policy";

export type CircleChatEntryDependencies = {
    loadCircle(circleId: string): Promise<Circle | null | undefined>;
    canRead(viewerDid: string, circle: Circle): Promise<boolean>;
    assertWritable(circle: Circle): Promise<void>;
};

/** Shared side-effect-free preflight for ensure, contact, and legacy join/leave actions. */
export const authorizeCircleChatEntry = async (
    viewerDid: string,
    circleId: string,
    intent: "read" | "write",
    dependencies: CircleChatEntryDependencies,
): Promise<Circle | null> => {
    if (!viewerDid || !circleId) return null;
    const circle = await dependencies.loadCircle(circleId);
    if (!circle || circle._id?.toString() !== circleId || !isValidCircleChatOwner(circle)) return null;
    if (!(await dependencies.canRead(viewerDid, circle))) return null;
    if (intent === "write") {
        try {
            await dependencies.assertWritable(circle);
        } catch {
            return null;
        }
    }
    return circle;
};

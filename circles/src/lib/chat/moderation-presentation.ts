import type { Circle } from "@/models/models";

export function getCircleModerationStarterAuthor({
    conversationSource,
    messageSource,
    messageVersion,
    senderDid,
    realAuthor,
}: {
    conversationSource?: unknown;
    messageSource?: unknown;
    messageVersion?: unknown;
    senderDid: string;
    realAuthor?: Circle;
}): Circle | undefined {
    if (conversationSource !== "circle_moderation" || messageSource !== "circle_moderation" || messageVersion !== "v1") {
        return realAuthor;
    }
    return { _id: senderDid, did: senderDid, name: "Kamooni Admin" } as Circle;
}

import { createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { getAuthenticationSecret } from "@/lib/auth/secret";
import { canParticipate, getParticipationRequiredMessage } from "@/lib/profile-completion";
import type { Circle } from "@/models/models";
import type { ChatTopicDraft } from "./mongo-types";

export const DEFAULT_DM_TOPIC_TITLE = "Hello";

export const dmPairKey = (a: string, b: string) => [a, b].sort().join("\u0000");

export const isMeaningfulDraft = (title: string, body: string, hashtags: string[]) =>
    title.trim() !== DEFAULT_DM_TOPIC_TITLE || !!body.trim() || hashtags.some((tag) => !!tag.trim());

export const getDmComposerParticipationError = (
    user: Partial<Circle> | null | undefined,
    action = "start direct messages",
) => (canParticipate(user) ? null : getParticipationRequiredMessage(action, user));

const PROFILE_CAPABILITY_TTL_MS = 10 * 60 * 1000;
const capabilityPayload = (authorDid: string, recipientDid: string, expiresAt: number) =>
    `${authorDid}\u0000${recipientDid}\u0000profile\u0000${expiresAt}`;

export const issueProfileComposeCapability = (
    authorDid: string,
    recipientDid: string,
    expiresAt = Date.now() + PROFILE_CAPABILITY_TTL_MS,
): string => {
    const signature = createHmac("sha256", getAuthenticationSecret())
        .update(capabilityPayload(authorDid, recipientDid, expiresAt))
        .digest("hex");
    return `${expiresAt}.${signature}`;
};

export const verifyProfileComposeCapability = (authorDid: string, recipientDid: string, capability?: string) => {
    if (!capability) return false;
    const match = /^(\d+)\.([a-f0-9]{64})$/.exec(capability);
    if (!match) return false;
    const expiresAt = Number(match[1]);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
    try {
        const expected = createHmac("sha256", getAuthenticationSecret())
            .update(capabilityPayload(authorDid, recipientDid, expiresAt))
            .digest("hex");
        return timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(expected, "hex"));
    } catch (error) {
        console.error(
            "Profile compose capability verification is not configured:",
            error instanceof Error ? error.message : "unknown configuration error",
        );
        return false;
    }
};

export const isDmComposeAuthorized = (
    eligibilityAllowed: boolean,
    profileDraft: boolean,
    authorDid: string,
    recipientDid: string,
    capability?: string,
) => eligibilityAllowed || profileDraft || verifyProfileComposeCapability(authorDid, recipientDid, capability);

export type DmNavigationResult =
    | { success: true; destination: "conversation"; conversationId: string }
    | { success: true; destination: "draft"; capability?: string }
    | { success: false; message: string };

export const resolveDmNavigation = async (
    findExistingConversationIds: () => Promise<string[]>,
    authorizeDraft: () => Promise<{ allowed: boolean; capability?: string }>,
): Promise<DmNavigationResult> => {
    const existingConversationIds = await findExistingConversationIds();
    if (existingConversationIds.length > 1) {
        return {
            success: false,
            message: "Multiple direct-message conversations already exist. Support must resolve this safely.",
        };
    }
    if (existingConversationIds.length === 1) {
        return { success: true, destination: "conversation", conversationId: existingConversationIds[0] };
    }

    const authorization = await authorizeDraft();
    if (!authorization.allowed) return { success: false, message: "Messaging is not available" };
    return { success: true, destination: "draft", capability: authorization.capability };
};

export type DraftWrite = Pick<ChatTopicDraft, "title" | "body" | "hashtags" | "revision" | "generation">;

export const buildDraftRevisionFilter = (authorDid: string, recipientDid: string, input: DraftWrite) => ({
    authorDid,
    recipientDid,
    generation: input.generation,
    revision: { $lt: input.revision },
});

export const allocateDmIds = (submissionId: string) => {
    if (!ObjectId.isValid(submissionId)) throw new Error("Invalid submission id");
    return {
        conversationId: new ObjectId(
            createHmac("sha256", "dm-conversation").update(submissionId).digest("hex").slice(0, 24),
        ),
        topicId: new ObjectId(createHmac("sha256", "dm-topic").update(submissionId).digest("hex").slice(0, 24)),
    };
};

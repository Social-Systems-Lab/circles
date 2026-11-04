"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByDid } from "@/lib/data/circle";
import { getDmEligibility } from "@/lib/data/relationships";
import {
    ChatConversations,
    ChatTopicDrafts,
    ChatTopicDraftTombstones,
    Circles,
    ensureRequiredChatIndexes,
} from "@/lib/data/db";
import {
    DEFAULT_DM_TOPIC_TITLE,
    type DmNavigationResult,
    getDmComposerParticipationError,
    isDmComposeAuthorized,
    isMeaningfulDraft,
    issueProfileComposeCapability,
    resolveDmNavigation,
    verifyProfileComposeCapability,
} from "@/lib/chat/dm-drafts";
import {
    discardDmDraftRecord,
    publishDmFirstTopic,
    reconcilePublishedDmDraft,
    saveDmDraftRecord,
} from "@/lib/chat/dm-draft-persistence";

const ensureDmComposerParticipant = async (authorDid: string) =>
    getDmComposerParticipationError(
        await Circles.findOne(
            { did: authorDid },
            {
                projection: {
                    circleType: 1,
                    picture: 1,
                    description: 1,
                    content: 1,
                    communityGuidelinesAcceptance: 1,
                    isEmailVerified: 1,
                    isAdmin: 1,
                },
            },
        ),
    );

const resolveRecipient = async (recipientDid: string) => {
    const recipient = await getCircleByDid(recipientDid);
    return recipient?.circleType === "user" && recipient.did ? recipient : null;
};

const findExistingDmIds = async (authorDid: string, recipientDid: string) => {
    const participants = [authorDid, recipientDid].sort();
    const existing = await ChatConversations.find(
        {
            type: "dm",
            participants: { $all: participants, $size: 2 },
            archived: { $ne: true },
            "metadata.dmProvisional": { $ne: true },
        },
        { projection: { _id: 1 } },
    ).toArray();
    return existing.map((conversation) => conversation._id.toString());
};

export async function openProfileDmComposerAction(recipientDid: string): Promise<DmNavigationResult> {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, message: "Not authenticated" };
    const participationError = await ensureDmComposerParticipant(authorDid);
    if (participationError) return { success: false, message: participationError };
    const recipient = await resolveRecipient(recipientDid);
    if (!recipient || recipient.did === authorDid) return { success: false, message: "Recipient unavailable" };
    const resolvedRecipientDid = recipient.did!;
    return resolveDmNavigation(
        () => findExistingDmIds(authorDid, resolvedRecipientDid),
        async () => {
            try {
                return { allowed: true, capability: issueProfileComposeCapability(authorDid, resolvedRecipientDid) };
            } catch (error) {
                console.error(
                    "Profile DM composer capability could not be issued:",
                    error instanceof Error ? error.message : "unknown configuration error",
                );
                return { allowed: false };
            }
        },
    );
}

export async function openNewDmComposerAction(recipientDid: string): Promise<DmNavigationResult> {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, message: "Not authenticated" };
    const recipient = await resolveRecipient(recipientDid);
    if (!recipient || recipient.did === authorDid) return { success: false, message: "Recipient unavailable" };
    const resolvedRecipientDid = recipient.did!;
    return resolveDmNavigation(
        () => findExistingDmIds(authorDid, resolvedRecipientDid),
        async () => ({ allowed: (await getDmEligibility(authorDid, resolvedRecipientDid)).isAllowed }),
    );
}

export async function getDmComposerAction(recipientDid: string, profileCapability?: string) {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, message: "Not authenticated" };
    const recipient = await resolveRecipient(recipientDid);
    if (!recipient || recipient.did === authorDid) return { success: false, message: "Recipient unavailable" };
    await ensureRequiredChatIndexes();
    const current = await ChatTopicDrafts.findOne({ authorDid, recipientDid, state: "active" });
    if (current) await reconcilePublishedDmDraft(authorDid, recipientDid, current.generation);
    const draft = await ChatTopicDrafts.findOne({ authorDid, recipientDid, state: "active" });
    const eligibility = await getDmEligibility(authorDid, recipientDid);
    if (
        !isDmComposeAuthorized(
            eligibility.isAllowed,
            draft?.entryKind === "profile",
            authorDid,
            recipientDid,
            profileCapability,
        )
    ) {
        return { success: false, message: "Messaging is not available" };
    }
    return {
        success: true,
        recipient: { did: recipient.did, name: recipient.name, handle: recipient.handle, picture: recipient.picture },
        draft: draft
            ? {
                  title: draft.title,
                  body: draft.body,
                  hashtags: draft.hashtags,
                  revision: draft.revision,
                  generation: draft.generation,
              }
            : null,
    };
}

export async function listDmDraftsAction() {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, drafts: [] };
    await ensureRequiredChatIndexes();
    const activeDrafts = await ChatTopicDrafts.find({ authorDid, state: "active" }).sort({ updatedAt: -1 }).toArray();
    await Promise.all(
        activeDrafts.map((draft) => reconcilePublishedDmDraft(authorDid, draft.recipientDid, draft.generation)),
    );
    const drafts = await ChatTopicDrafts.find({ authorDid, state: "active" }).sort({ updatedAt: -1 }).toArray();
    const recipients = await Promise.all(drafts.map((draft) => getCircleByDid(draft.recipientDid)));
    return {
        success: true,
        drafts: drafts.map((draft, index) => ({
            recipientDid: draft.recipientDid,
            title: draft.title,
            updatedAt: draft.updatedAt.toISOString(),
            name: recipients[index]?.name || "Message draft",
            picture: recipients[index]?.picture,
        })),
    };
}

export async function saveDmDraftAction(input: {
    recipientDid: string;
    title: string;
    body: string;
    hashtags: string[];
    revision: number;
    generation: string;
    profileCapability?: string;
}) {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, message: "Not authenticated" };
    const participationError = await ensureDmComposerParticipant(authorDid);
    if (participationError) return { success: false, message: participationError };
    const recipient = await resolveRecipient(input.recipientDid);
    if (!recipient || recipient.did === authorDid) return { success: false, message: "Recipient unavailable" };
    const resolvedRecipientDid = recipient.did!;
    await ensureRequiredChatIndexes();
    if (
        await ChatTopicDraftTombstones.findOne({
            authorDid,
            recipientDid: resolvedRecipientDid,
            generation: input.generation,
        })
    ) {
        return { success: true, saved: false, stale: true };
    }
    const existing = await ChatTopicDrafts.findOne({ authorDid, recipientDid: resolvedRecipientDid });
    const profileAllowed = verifyProfileComposeCapability(authorDid, resolvedRecipientDid, input.profileCapability);
    const eligibility = await getDmEligibility(authorDid, resolvedRecipientDid);
    const entryKind = existing?.state === "active" ? existing.entryKind : profileAllowed ? "profile" : "composer";
    if (entryKind !== "profile" && !eligibility.isAllowed)
        return { success: false, message: "Messaging is not available" };
    if (!isMeaningfulDraft(input.title, input.body, input.hashtags)) return { success: true, saved: false };
    try {
        const result = await saveDmDraftRecord({
            authorDid,
            recipientDid: resolvedRecipientDid,
            title: input.title,
            body: input.body,
            hashtags: input.hashtags,
            revision: input.revision,
            generation: input.generation,
            entryKind,
        });
        return { success: true, ...result };
    } catch (error: any) {
        if (error?.code === 11000) return { success: true, saved: false, stale: true };
        return { success: false, message: "Could not save draft" };
    }
}

export async function discardDmDraftAction(recipientDid: string, generation: string) {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, message: "Not authenticated" };
    await ensureRequiredChatIndexes();
    await discardDmDraftRecord(authorDid, recipientDid, generation);
    return { success: true };
}

export async function submitDmFirstTopicAction(input: {
    recipientDid: string;
    title: string;
    body: string;
    hashtags: string[];
    generation: string;
    submissionId: string;
    profileCapability?: string;
}): Promise<{ success: true; conversationId: string; topicId?: string } | { success: false; message: string }> {
    const authorDid = await getAuthenticatedUserDid();
    if (!authorDid) return { success: false, message: "Not authenticated" };
    const participationError = await ensureDmComposerParticipant(authorDid);
    if (participationError) return { success: false, message: participationError };
    const recipient = await resolveRecipient(input.recipientDid);
    if (!recipient || recipient.did === authorDid) return { success: false, message: "Recipient unavailable" };
    const resolvedRecipientDid = recipient.did!;
    if (!input.title.trim()) return { success: false, message: "Topic title is required" };
    await ensureRequiredChatIndexes();
    const draft = await ChatTopicDrafts.findOne({
        authorDid,
        recipientDid: resolvedRecipientDid,
        generation: input.generation,
        state: "active",
    });
    const archivedConversation = await ChatConversations.findOne(
        {
            type: "dm",
            participants: { $all: [authorDid, resolvedRecipientDid], $size: 2 },
            archived: { $ne: true },
            "metadata.dmProvisional": { $ne: true },
            archivedBy: authorDid,
        },
        { projection: { _id: 1 } },
    );
    if (archivedConversation) return { success: false, message: "Unarchive this conversation before posting." };
    const eligibility = await getDmEligibility(authorDid, resolvedRecipientDid);
    if (
        !isDmComposeAuthorized(
            eligibility.isAllowed,
            draft?.entryKind === "profile",
            authorDid,
            resolvedRecipientDid,
            input.profileCapability,
        )
    )
        return { success: false, message: "Messaging is no longer available" };

    try {
        return {
            success: true,
            ...(await publishDmFirstTopic({ ...input, authorDid, recipientDid: resolvedRecipientDid })),
        };
    } catch (error) {
        console.error("submitDmFirstTopicAction failed", error);
        return { success: false, message: "Could not create the topic. Your draft is still saved." };
    }
}

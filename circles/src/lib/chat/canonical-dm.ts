import { ObjectId } from "mongodb";
import { CanonicalDmClaims, ChatConversations, ensureRequiredChatIndexes } from "@/lib/data/db";
import { dmPairKey } from "./dm-drafts";
import type { ChatConversation } from "./mongo-types";

const sameParticipants = (left: string[], right: string[]) =>
    left.length === 2 && left.slice().sort().join("\u0000") === right.join("\u0000");

const loadClaimTarget = async (conversationId: string, participants: string[]) => {
    if (!ObjectId.isValid(conversationId)) throw new Error("Direct-message claim has an invalid conversation ID");
    const conversation = await ChatConversations.findOne({ _id: new ObjectId(conversationId) });
    if (!conversation || conversation.type !== "dm" || !sameParticipants(conversation.participants, participants)) {
        throw new Error("Direct-message claim target is missing or corrupt");
    }
    if (conversation.archived === true) throw new Error("Direct-message claim points to an archived conversation");
    return conversation;
};

const loadRacingClaimTarget = async (conversationId: string, participants: string[]) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            return await loadClaimTarget(conversationId, participants);
        } catch (error) {
            if (attempt === 19) throw error;
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
    throw new Error("Direct-message claim race did not settle");
};

export async function resolveCanonicalDm(
    participantA: string,
    participantB: string,
    options?: { proposedConversationId?: ObjectId; provisional?: boolean; firstSubmissionId?: string },
): Promise<ChatConversation & { _id: ObjectId }> {
    if (!participantA || !participantB || participantA === participantB) throw new Error("Invalid DM participants");
    await ensureRequiredChatIndexes();
    const participants = [participantA, participantB].sort();
    const pairKey = dmPairKey(participantA, participantB);
    const existing = await ChatConversations.find({
        type: "dm",
        participants: { $all: participants, $size: 2 },
        archived: { $ne: true },
    }).toArray();
    if (existing.length > 1)
        throw new Error("Multiple direct-message conversations already exist. Support must resolve this safely.");

    const claim = await CanonicalDmClaims.findOne({ pairKey });
    if (claim) {
        if (!sameParticipants(claim.participants, participants))
            throw new Error("Direct-message claim participant conflict");
        let target: ChatConversation & { _id: ObjectId };
        try {
            target = (await loadClaimTarget(claim.conversationId, participants)) as ChatConversation & {
                _id: ObjectId;
            };
        } catch (error) {
            if (claim.state !== "creating" || existing.length !== 0) throw error;
            const now = new Date();
            const handle = `dm-${participants.join("-")}`;
            await ChatConversations.updateOne(
                { _id: new ObjectId(claim.conversationId) },
                {
                    $setOnInsert: {
                        type: "dm",
                        name: handle,
                        handle,
                        participants,
                        createdAt: now,
                        updatedAt: now,
                        metadata: { dmProvisional: true },
                    },
                },
                { upsert: true },
            );
            target = (await loadClaimTarget(claim.conversationId, participants)) as ChatConversation & {
                _id: ObjectId;
            };
        }
        if (existing.length === 1 && existing[0]._id.toString() !== target._id.toString()) {
            throw new Error("Direct-message claim conflicts with existing history");
        }
        if (claim.state === "creating") {
            await CanonicalDmClaims.updateOne(
                { _id: claim._id, pairKey, conversationId: claim.conversationId, state: "creating" },
                { $set: { state: "ready", readyAt: new Date() } },
            );
        }
        return target;
    }

    const conversationId = existing[0]?._id || options?.proposedConversationId || new ObjectId();
    try {
        await CanonicalDmClaims.insertOne({
            pairKey,
            participants,
            conversationId: conversationId.toString(),
            firstSubmissionId: options?.firstSubmissionId || "legacy",
            state: existing[0] ? "ready" : "creating",
            ...(existing[0] ? { readyAt: new Date() } : {}),
            createdAt: new Date(),
        });
    } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const winner = await CanonicalDmClaims.findOne({ pairKey });
        if (!winner || !sameParticipants(winner.participants, participants))
            throw new Error("Direct-message claim race was corrupt");
        if (winner.state === "creating") return resolveCanonicalDm(participantA, participantB, options);
        return (await loadRacingClaimTarget(winner.conversationId, participants)) as ChatConversation & {
            _id: ObjectId;
        };
    }

    if (existing[0]) return existing[0] as ChatConversation & { _id: ObjectId };
    const now = new Date();
    const handle = `dm-${participants.join("-")}`;
    try {
        await ChatConversations.insertOne({
            _id: conversationId,
            type: "dm",
            name: handle,
            handle,
            participants,
            createdAt: now,
            updatedAt: now,
            ...(options?.provisional === false ? {} : { metadata: { dmProvisional: true } }),
        });
    } catch (error: any) {
        if (error?.code !== 11000) throw error;
    }
    const created = (await loadClaimTarget(conversationId.toString(), participants)) as ChatConversation & {
        _id: ObjectId;
    };
    await CanonicalDmClaims.updateOne(
        { pairKey, conversationId: conversationId.toString(), state: "creating" },
        { $set: { state: "ready", readyAt: new Date() } },
    );
    return created;
}

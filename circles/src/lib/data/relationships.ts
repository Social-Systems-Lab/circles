import { Circle } from "@/models/models";
import { ChatConversations, ChatMessageDocs, Circles, Members, UserRelationships } from "./db";

const CONNECT_STATUS_VALUES = ["none", "pending_sent", "pending_received", "accepted"] as const;
const DM_PERMISSION_VALUES = ["none", "allowed"] as const;
const DM_PERMISSION_SOURCE_VALUES = ["none", "contact", "legacy_dm", "recipient_setting"] as const;

export type RelationshipConnectStatus = (typeof CONNECT_STATUS_VALUES)[number];
export type RelationshipDmPermission = (typeof DM_PERMISSION_VALUES)[number];
export type RelationshipDmPermissionSource = (typeof DM_PERMISSION_SOURCE_VALUES)[number];

export type RelationshipEdge = {
    _id?: any;
    fromDid: string;
    toDid: string;
    isFollowing: boolean;
    connectStatus: RelationshipConnectStatus;
    dmPermission: RelationshipDmPermission;
    dmPermissionSource: RelationshipDmPermissionSource;
    createdAt: Date;
    updatedAt: Date;
};

export type DmEligibility = {
    isAllowed: boolean;
    existingConversationId?: string;
    hasExistingConversation: boolean;
    dmPermission: RelationshipDmPermission;
    dmPermissionSource: RelationshipDmPermissionSource;
    relationshipEdge: RelationshipEdge | null;
};

export type ProfileRelationshipState = {
    viewerDid: string;
    targetDid: string;
    isFollowing: boolean;
    connectStatus: RelationshipConnectStatus;
    dmAllowed: boolean;
    dmPermissionSource: RelationshipDmPermissionSource;
    hasExistingDm: boolean;
    showMessage: boolean;
    showConnect: boolean;
    connectLabel: "Connect" | "Add Contact" | "Requested" | null;
};

UserRelationships?.createIndex({ fromDid: 1, toDid: 1 }, { unique: true });
UserRelationships?.createIndex({ fromDid: 1, updatedAt: -1 });
UserRelationships?.createIndex({ toDid: 1, connectStatus: 1 });

const normalizeConnectStatus = (value?: unknown): RelationshipConnectStatus =>
    CONNECT_STATUS_VALUES.includes(value as RelationshipConnectStatus) ? (value as RelationshipConnectStatus) : "none";

const normalizeDmPermission = (value?: unknown): RelationshipDmPermission =>
    DM_PERMISSION_VALUES.includes(value as RelationshipDmPermission) ? (value as RelationshipDmPermission) : "none";

const normalizeDmPermissionSource = (value?: unknown): RelationshipDmPermissionSource =>
    DM_PERMISSION_SOURCE_VALUES.includes(value as RelationshipDmPermissionSource)
        ? (value as RelationshipDmPermissionSource)
        : "none";

const normalizeRelationshipEdge = (edge: any): RelationshipEdge => ({
    _id: edge?._id,
    fromDid: String(edge?.fromDid || ""),
    toDid: String(edge?.toDid || ""),
    isFollowing: edge?.isFollowing === true,
    connectStatus: normalizeConnectStatus(edge?.connectStatus),
    dmPermission: normalizeDmPermission(edge?.dmPermission),
    dmPermissionSource: normalizeDmPermissionSource(edge?.dmPermissionSource),
    createdAt: edge?.createdAt instanceof Date ? edge.createdAt : new Date(edge?.createdAt || Date.now()),
    updatedAt: edge?.updatedAt instanceof Date ? edge.updatedAt : new Date(edge?.updatedAt || Date.now()),
});

const buildDefaultRelationshipEdge = (fromDid: string, toDid: string, now: Date): RelationshipEdge => ({
    fromDid,
    toDid,
    isFollowing: false,
    connectStatus: "none",
    dmPermission: "none",
    dmPermissionSource: "none",
    createdAt: now,
    updatedAt: now,
});

const isStrongerDmPermissionSource = (source: RelationshipDmPermissionSource): boolean =>
    source === "contact" || source === "recipient_setting";

const getConnectLabel = (
    connectStatus: RelationshipConnectStatus,
    isFollowing: boolean,
): "Connect" | "Add Contact" | "Requested" | null => {
    if (connectStatus === "pending_sent") {
        return "Requested";
    }
    if (connectStatus === "accepted") {
        return null;
    }
    return isFollowing ? "Add Contact" : "Connect";
};

const findExistingDmConversationId = async (
    didA: string,
    didB: string,
    requireMessageHistory: boolean,
): Promise<string | undefined> => {
    const conversation = await ChatConversations.findOne(
        {
            type: "dm",
            participants: { $all: [didA, didB] },
            archived: { $ne: true },
        },
        {
            projection: {
                _id: 1,
                participants: 1,
            },
        },
    );

    if (!conversation?._id) {
        return undefined;
    }

    const participants = Array.from(
        new Set(
            ((conversation as any).participants || []).filter(
                (participantDid: unknown): participantDid is string =>
                    typeof participantDid === "string" && participantDid.length > 0,
            ),
        ),
    );
    if (participants.length !== 2 || !participants.includes(didA) || !participants.includes(didB)) {
        return undefined;
    }

    const conversationId = String(conversation._id);
    if (!requireMessageHistory) {
        return conversationId;
    }

    const existingMessage = await ChatMessageDocs.findOne(
        { conversationId },
        {
            projection: { _id: 1 },
        },
    );

    return existingMessage?._id ? conversationId : undefined;
};

const isFollowingUser = async (viewerDid: string, targetDid: string): Promise<boolean> => {
    if (!viewerDid || !targetDid || viewerDid === targetDid) {
        return false;
    }

    const targetCircle = await Circles.findOne(
        { did: targetDid, circleType: "user" },
        {
            projection: { _id: 1 },
        },
    );
    if (!targetCircle?._id) {
        return false;
    }

    const membership = await Members.findOne({
        userDid: viewerDid,
        circleId: String(targetCircle._id),
    });

    return !!membership;
};

export const getRelationshipEdge = async (fromDid: string, toDid: string): Promise<RelationshipEdge | null> => {
    if (!fromDid || !toDid) {
        return null;
    }

    const edge = await UserRelationships.findOne({ fromDid, toDid });
    return edge ? normalizeRelationshipEdge(edge) : null;
};

export const upsertFollowState = async (fromDid: string, toDid: string, isFollowing: boolean): Promise<void> => {
    if (!fromDid || !toDid || fromDid === toDid) {
        return;
    }

    const now = new Date();
    await UserRelationships.updateOne(
        { fromDid, toDid },
        {
            $set: {
                isFollowing,
                updatedAt: now,
            },
            $setOnInsert: buildDefaultRelationshipEdge(fromDid, toDid, now),
        },
        { upsert: true },
    );
};

const upsertLegacyDmPermissionEdge = async (fromDid: string, toDid: string): Promise<number> => {
    const existing = await getRelationshipEdge(fromDid, toDid);
    const now = new Date();

    if (!existing) {
        const edge = buildDefaultRelationshipEdge(fromDid, toDid, now);
        edge.dmPermission = "allowed";
        edge.dmPermissionSource = "legacy_dm";
        await UserRelationships.insertOne(edge);
        return 1;
    }

    if (isStrongerDmPermissionSource(existing.dmPermissionSource)) {
        return 0;
    }

    const shouldSetPermission = existing.dmPermission !== "allowed";
    const shouldSetSource = existing.dmPermissionSource !== "legacy_dm";

    if (!shouldSetPermission && !shouldSetSource) {
        return 0;
    }

    await UserRelationships.updateOne(
        { fromDid, toDid },
        {
            $set: {
                ...(shouldSetPermission ? { dmPermission: "allowed" as const } : {}),
                ...(shouldSetSource ? { dmPermissionSource: "legacy_dm" as const } : {}),
                updatedAt: now,
            },
        },
    );

    return 1;
};

export const upsertLegacyDmPermissionPair = async (didA: string, didB: string): Promise<number> => {
    if (!didA || !didB || didA === didB) {
        return 0;
    }

    let touchedEdges = 0;
    touchedEdges += await upsertLegacyDmPermissionEdge(didA, didB);
    touchedEdges += await upsertLegacyDmPermissionEdge(didB, didA);
    return touchedEdges;
};

export const getDmEligibility = async (viewerDid: string, targetDid: string): Promise<DmEligibility> => {
    if (!viewerDid || !targetDid || viewerDid === targetDid) {
        return {
            isAllowed: false,
            hasExistingConversation: false,
            dmPermission: "none",
            dmPermissionSource: "none",
            relationshipEdge: null,
        };
    }

    const existingConversationId = await findExistingDmConversationId(viewerDid, targetDid, false);
    if (existingConversationId) {
        await upsertLegacyDmPermissionPair(viewerDid, targetDid);
    }

    const relationshipEdge = await getRelationshipEdge(viewerDid, targetDid);
    if (existingConversationId) {
        return {
            isAllowed: true,
            existingConversationId,
            hasExistingConversation: true,
            dmPermission: "allowed",
            dmPermissionSource:
                relationshipEdge?.dmPermissionSource && relationshipEdge.dmPermissionSource !== "none"
                    ? relationshipEdge.dmPermissionSource
                    : "legacy_dm",
            relationshipEdge,
        };
    }

    if (relationshipEdge?.dmPermission === "allowed") {
        return {
            isAllowed: true,
            hasExistingConversation: false,
            dmPermission: relationshipEdge.dmPermission,
            dmPermissionSource: relationshipEdge.dmPermissionSource,
            relationshipEdge,
        };
    }

    return {
        isAllowed: false,
        hasExistingConversation: false,
        dmPermission: relationshipEdge?.dmPermission || "none",
        dmPermissionSource: relationshipEdge?.dmPermissionSource || "none",
        relationshipEdge,
    };
};

export const getProfileRelationshipState = async (
    viewerDid: string,
    targetDid: string,
): Promise<ProfileRelationshipState> => {
    const [dmEligibility, relationshipEdge, following] = await Promise.all([
        getDmEligibility(viewerDid, targetDid),
        getRelationshipEdge(viewerDid, targetDid),
        isFollowingUser(viewerDid, targetDid),
    ]);

    const isFollowing = following || relationshipEdge?.isFollowing === true;
    const connectStatus = relationshipEdge?.connectStatus || "none";
    const dmAllowed = dmEligibility.isAllowed;

    return {
        viewerDid,
        targetDid,
        isFollowing,
        connectStatus,
        dmAllowed,
        dmPermissionSource: dmEligibility.dmPermissionSource,
        hasExistingDm: dmEligibility.hasExistingConversation,
        showMessage: dmAllowed,
        showConnect: !dmAllowed && connectStatus !== "accepted",
        connectLabel: dmAllowed ? null : getConnectLabel(connectStatus, isFollowing),
    };
};

export const listDmEligibleContactsForUserDid = async (userDid: string): Promise<Circle[]> => {
    if (!userDid) {
        return [];
    }

    const contactDids = new Set<string>();

    const relationshipEdges = await UserRelationships.find(
        {
            fromDid: userDid,
            dmPermission: "allowed",
        },
        {
            projection: { toDid: 1 },
        },
    ).toArray();

    for (const edge of relationshipEdges) {
        if (typeof edge?.toDid === "string" && edge.toDid !== userDid) {
            contactDids.add(edge.toDid);
        }
    }

    const dmConversations = await ChatConversations.find(
        {
            type: "dm",
            participants: userDid,
            archived: { $ne: true },
        },
        {
            projection: { participants: 1 },
        },
    ).toArray();

    for (const conversation of dmConversations) {
        for (const participantDid of (conversation as any)?.participants || []) {
            if (typeof participantDid === "string" && participantDid !== userDid) {
                contactDids.add(participantDid);
            }
        }
    }

    if (contactDids.size === 0) {
        return [];
    }

    const circles = await Circles.find(
        {
            did: { $in: Array.from(contactDids) },
            circleType: "user",
        },
        {
            projection: {
                _id: 1,
                did: 1,
                handle: 1,
                name: 1,
                picture: 1,
                circleType: 1,
            },
        },
    )
        .sort({ name: 1 })
        .toArray();

    return circles.map((circle: any) => ({
        ...circle,
        _id: circle?._id ? String(circle._id) : circle?._id,
    }));
};

export const migrateLegacyDmRelationships = async ({
    apply,
    limit,
}: {
    apply: boolean;
    limit?: number;
}): Promise<{
    scannedConversations: number;
    skippedWithoutHistory: number;
    skippedInvalidParticipants: number;
    touchedEdges: number;
}> => {
    const cursor = ChatConversations.find(
        {
            type: "dm",
            archived: { $ne: true },
        },
        {
            projection: {
                _id: 1,
                participants: 1,
            },
        },
    );

    let scannedConversations = 0;
    let skippedWithoutHistory = 0;
    let skippedInvalidParticipants = 0;
    let touchedEdges = 0;

    for await (const conversation of cursor) {
        if (typeof limit === "number" && scannedConversations >= limit) {
            break;
        }

        scannedConversations += 1;

        const participants: string[] = Array.from(
            new Set(
                ((conversation as any)?.participants || []).filter(
                    (participantDid: unknown): participantDid is string =>
                        typeof participantDid === "string" && participantDid.length > 0,
                ),
            ),
        );

        if (participants.length !== 2) {
            skippedInvalidParticipants += 1;
            continue;
        }

        const hasHistory = await findExistingDmConversationId(participants[0], participants[1], true);
        if (!hasHistory) {
            skippedWithoutHistory += 1;
            continue;
        }

        if (apply) {
            touchedEdges += await upsertLegacyDmPermissionPair(participants[0], participants[1]);
        } else {
            touchedEdges += 2;
        }
    }

    return {
        scannedConversations,
        skippedWithoutHistory,
        skippedInvalidParticipants,
        touchedEdges,
    };
};

import { Circle } from "@/models/models";
import { ChatConversations, Circles, Members, UserRelationships } from "./db";

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
    connectLabel: "Connect" | "Add Contact" | "Requested" | "Requested You" | null;
    connectLabelReason:
        | "message_available"
        | "pending_sent"
        | "pending_received"
        | "contact_not_established"
        | "contact_established";
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

const getConnectLabel = (
    connectStatus: RelationshipConnectStatus,
): "Connect" | "Add Contact" | "Requested" | "Requested You" | null => {
    if (connectStatus === "pending_sent") return "Requested";
    if (connectStatus === "pending_received") return "Requested You";
    if (connectStatus === "accepted") return null;
    return "Add Contact";
};

const findExistingDmConversationId = async (didA: string, didB: string): Promise<string | undefined> => {
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

    if (!conversation?._id) return undefined;

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

    return String(conversation._id);
};

const isFollowingUser = async (viewerDid: string, targetDid: string): Promise<boolean> => {
    if (!viewerDid || !targetDid || viewerDid === targetDid) return false;

    const targetCircle = await Circles.findOne(
        { did: targetDid, circleType: "user" },
        {
            projection: { _id: 1 },
        },
    );
    if (!targetCircle?._id) return false;

    const membership = await Members.findOne({
        userDid: viewerDid,
        circleId: String(targetCircle._id),
    });

    return !!membership;
};

export const getRelationshipEdge = async (fromDid: string, toDid: string): Promise<RelationshipEdge | null> => {
    if (!fromDid || !toDid) return null;

    const edge = await UserRelationships.findOne({ fromDid, toDid });
    return edge ? normalizeRelationshipEdge(edge) : null;
};

export const getProfileRelationshipState = async (
    viewerDid: string,
    targetDid: string,
): Promise<ProfileRelationshipState> => {
    const [existingConversationId, relationshipEdge, following] = await Promise.all([
        findExistingDmConversationId(viewerDid, targetDid),
        getRelationshipEdge(viewerDid, targetDid),
        isFollowingUser(viewerDid, targetDid),
    ]);

    const isFollowing = following || relationshipEdge?.isFollowing === true;
    const connectStatus = relationshipEdge?.connectStatus || "none";
    const dmPermission = relationshipEdge?.dmPermission || "none";
    const dmPermissionSource = relationshipEdge?.dmPermissionSource || "none";
    const hasExistingDm = !!existingConversationId;
    const dmAllowed = hasExistingDm || dmPermission === "allowed";

    return {
        viewerDid,
        targetDid,
        isFollowing,
        connectStatus,
        dmAllowed,
        dmPermissionSource: hasExistingDm && dmPermissionSource === "none" ? "legacy_dm" : dmPermissionSource,
        hasExistingDm,
        showMessage: dmAllowed,
        showConnect: connectStatus !== "accepted",
        connectLabel: connectStatus === "accepted" ? null : getConnectLabel(connectStatus),
        connectLabelReason: dmAllowed
            ? "message_available"
            : connectStatus === "pending_sent"
              ? "pending_sent"
              : connectStatus === "pending_received"
                ? "pending_received"
                : connectStatus === "accepted"
                  ? "contact_established"
                  : "contact_not_established",
    };
};

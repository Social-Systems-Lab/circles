import { ObjectId } from "mongodb";
import {
    isEventNoticeboardBound,
    normalizeCanonicalObjectId,
    type EventNoticeboardFeedBinding,
    type EventNoticeboardPostBinding,
} from "./noticeboard-source-binding-policy";

export const EVENT_NOTICEBOARD_UNAVAILABLE_MESSAGE = "Noticeboard unavailable.";

export type ValidatedEventNoticeboardEntry = {
    hostCircleId: string;
    postId: string;
    classification: "current" | "stale";
};

export type ValidatedEventNoticeboardContext = {
    eventId: string;
    primaryCircleId: string;
    existingHostCircleIds: string[];
    requestedHostCircleIds?: string[];
    entriesByCircleId: Record<string, ValidatedEventNoticeboardEntry>;
};

const isPlainRecordObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const isPlainEmptyObject = (value: unknown): boolean =>
    isPlainRecordObject(value) && Object.keys(value).length === 0;

export const hasStoredEventNoticeboardReferences = ({
    noticeboardPostId,
    noticeboardPostIdsByCircleId,
}: {
    noticeboardPostId?: unknown;
    noticeboardPostIdsByCircleId?: unknown;
}): boolean => {
    if (noticeboardPostId !== null && noticeboardPostId !== undefined) return true;
    if (noticeboardPostIdsByCircleId === null || noticeboardPostIdsByCircleId === undefined) return false;
    return !isPlainEmptyObject(noticeboardPostIdsByCircleId);
};

export const shouldOrchestrateEventNoticeboardUpdate = ({
    publicationRequested,
    hasStoredNoticeboardState,
}: {
    publicationRequested: boolean;
    hasStoredNoticeboardState: boolean;
}): boolean => publicationRequested || hasStoredNoticeboardState;

const normalizeIdList = (values: unknown): string[] | null => {
    if (!Array.isArray(values)) return null;
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const id = normalizeCanonicalObjectId(value);
        if (!id) return null;
        if (!seen.has(id)) result.push(id);
        seen.add(id);
    }
    return result;
};

const normalizeExistingHostIds = (values: unknown, primaryCircleId: string): string[] | null => {
    if (values === null || values === undefined) return [primaryCircleId];
    const normalized = normalizeIdList(values);
    return normalized ? [primaryCircleId, ...normalized.filter((id) => id !== primaryCircleId)] : null;
};

export const resolveEventNoticeboardBindings = async ({
    eventId: rawEventId,
    primaryCircleId: rawPrimaryCircleId,
    existingHostCircleIds: rawExistingHostCircleIds,
    requestedHostCircleIds: rawRequestedHostCircleIds,
    noticeboardPostId: rawPrimaryPostId,
    noticeboardPostIdsByCircleId: rawMap,
    findPostById,
    findFeedById,
}: {
    eventId: unknown;
    primaryCircleId: unknown;
    existingHostCircleIds: unknown;
    requestedHostCircleIds?: unknown;
    noticeboardPostId?: unknown;
    noticeboardPostIdsByCircleId?: unknown;
    findPostById: (id: ObjectId) => Promise<EventNoticeboardPostBinding | null>;
    findFeedById: (id: ObjectId) => Promise<EventNoticeboardFeedBinding | null>;
}): Promise<ValidatedEventNoticeboardContext | null> => {
    const eventId = normalizeCanonicalObjectId(rawEventId);
    const primaryCircleId = normalizeCanonicalObjectId(rawPrimaryCircleId);
    const existingHostCircleIds = primaryCircleId
        ? normalizeExistingHostIds(rawExistingHostCircleIds, primaryCircleId)
        : null;
    const requestedHostCircleIds =
        rawRequestedHostCircleIds === undefined ? undefined : normalizeIdList(rawRequestedHostCircleIds);
    if (!eventId || !primaryCircleId || !existingHostCircleIds || requestedHostCircleIds === null) return null;

    const hasPrimary = rawPrimaryPostId !== null && rawPrimaryPostId !== undefined;
    const hasMapValue = rawMap !== null && rawMap !== undefined;
    if (hasMapValue && !isPlainRecordObject(rawMap)) return null;
    const hasStoredMapEntries = hasMapValue && Object.keys(rawMap).length > 0;

    const canonicalMap: Record<string, string> = {};
    const postOwners = new Map<string, string>();
    for (const [rawKey, rawValue] of Object.entries(rawMap || {})) {
        const key = normalizeCanonicalObjectId(rawKey);
        const value = normalizeCanonicalObjectId(rawValue);
        if (!key || !value || Object.prototype.hasOwnProperty.call(canonicalMap, key)) return null;
        const priorOwner = postOwners.get(value);
        if (priorOwner && priorOwner !== key) return null;
        canonicalMap[key] = value;
        postOwners.set(value, key);
    }

    const primaryPostId = hasPrimary ? normalizeCanonicalObjectId(rawPrimaryPostId) : null;
    if (hasPrimary && !primaryPostId) return null;
    if (hasStoredMapEntries && !hasPrimary) return null;
    const mapPrimaryPostId = canonicalMap[primaryCircleId];
    if (hasStoredMapEntries && !mapPrimaryPostId) return null;
    if (hasPrimary && mapPrimaryPostId && mapPrimaryPostId !== primaryPostId) return null;
    if (hasPrimary && !hasStoredMapEntries) {
        const priorOwner = postOwners.get(primaryPostId!);
        if (priorOwner && priorOwner !== primaryCircleId) return null;
        canonicalMap[primaryCircleId] = primaryPostId!;
        postOwners.set(primaryPostId!, primaryCircleId);
    }

    const currentIds = new Set(existingHostCircleIds);
    const entriesByCircleId: Record<string, ValidatedEventNoticeboardEntry> = {};
    for (const [hostCircleId, postId] of Object.entries(canonicalMap)) {
        const post = await findPostById(new ObjectId(postId));
        const feedId = normalizeCanonicalObjectId(post?.feedId);
        if (!post || !feedId) return null;
        const feed = await findFeedById(new ObjectId(feedId));
        if (
            !isEventNoticeboardBound({
                storedNoticeboardPostId: postId,
                post,
                feed,
                expectedEventId: eventId,
                expectedCircleId: hostCircleId,
            })
        )
            return null;
        entriesByCircleId[hostCircleId] = {
            hostCircleId,
            postId,
            classification: currentIds.has(hostCircleId) ? "current" : "stale",
        };
    }

    return { eventId, primaryCircleId, existingHostCircleIds, requestedHostCircleIds, entriesByCircleId };
};

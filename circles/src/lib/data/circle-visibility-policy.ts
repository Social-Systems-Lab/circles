import { canDiscoverCircleByLifecycle, canReadCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { circleVisibilitySchema } from "@/models/models";
import type { Circle, CircleType, CircleVisibility, Member } from "@/models/models";
import { ObjectId, type Filter } from "mongodb";
import { getDiscoverableLifecycleQuery } from "@/lib/data/circle-lifecycle-policy";

type VisibilityAccessInput = {
    circle?: Partial<Circle> | null;
    viewerDid?: string;
    isMember: boolean;
};

type CircleVisibilityEntitlementInput = {
    actorDid?: string;
    circleType?: CircleType;
    visibility?: unknown;
};

type EntitlementDependencies = {
    isSuperAdminDid: (actorDid: string | undefined) => Promise<boolean>;
};

type MembershipDependencies = {
    getMember: (userDid: string, circleId: string) => Promise<Member | null>;
};

type MemberCircleIdDependencies = {
    findMemberCircleIds: (viewerDid: string) => Promise<Array<{ circleId?: unknown }>>;
};

const canonicalMemberCircleIdDependencies: MemberCircleIdDependencies = {
    findMemberCircleIds: async (viewerDid) => {
        const { Members } = await import("@/lib/data/db");
        return Members.find({ userDid: viewerDid }, { projection: { circleId: 1 } }).toArray();
    },
};

const canonicalMembershipDependencies: MembershipDependencies = {
    getMember: async (userDid, circleId) => {
        const { getMember } = await import("@/lib/data/member");
        return getMember(userDid, circleId);
    },
};

const superAdminEntitlementDependencies: EntitlementDependencies = {
    isSuperAdminDid: async (actorDid) => {
        const { isSuperAdminDid } = await import("@/lib/auth/superadmin");
        return isSuperAdminDid(actorDid);
    },
};

export const getCircleVisibility = (circle?: Partial<Circle> | null): CircleVisibility =>
    circle?.circleType === "user" ? "public" : (circle?.visibility ?? "public");

export const evaluateCircleVisibilityAccess = ({
    circle,
    viewerDid,
    isMember,
}: VisibilityAccessInput): { canDiscover: boolean; canRead: boolean } => {
    if (!circle) return { canDiscover: false, canRead: false };
    const allowed = getCircleVisibility(circle) === "public" || Boolean(viewerDid && isMember);
    return { canDiscover: allowed, canRead: allowed };
};

const hasCanonicalMembership = async (
    viewerDid: string | undefined,
    circle: Partial<Circle>,
    dependencies: MembershipDependencies,
): Promise<boolean> => {
    const circleId = circle._id?.toString();
    if (!viewerDid || !circleId || !ObjectId.isValid(circleId)) return false;
    const member = await dependencies.getMember(viewerDid, circleId);
    return member?.userDid === viewerDid && member.circleId === circleId;
};

export const canReadCircle = async (
    viewerDid: string | undefined,
    circle?: Partial<Circle> | null,
    dependencies: MembershipDependencies = canonicalMembershipDependencies,
): Promise<boolean> => {
    if (!circle) return false;
    const isMember =
        getCircleVisibility(circle) === "secret"
            ? await hasCanonicalMembership(viewerDid, circle, dependencies)
            : false;
    const visibility = evaluateCircleVisibilityAccess({ circle, viewerDid, isMember });
    return visibility.canRead && canReadCircleByLifecycle(circle);
};

export const canDiscoverCircle = async (
    viewerDid: string | undefined,
    circle?: Partial<Circle> | null,
    dependencies: MembershipDependencies = canonicalMembershipDependencies,
): Promise<boolean> => {
    if (!circle) return false;
    const isMember =
        getCircleVisibility(circle) === "secret"
            ? await hasCanonicalMembership(viewerDid, circle, dependencies)
            : false;
    const visibility = evaluateCircleVisibilityAccess({ circle, viewerDid, isMember });
    return visibility.canDiscover && canDiscoverCircleByLifecycle(circle);
};

export const circleVisibilityMongoQuery = ({
    viewerDid,
    memberCircleIds = [],
}: {
    viewerDid?: string;
    memberCircleIds?: readonly string[];
}): Filter<Circle> => {
    const visibleConditions: Filter<Circle>[] = [
        { circleType: "user" },
        { visibility: { $exists: false } },
        { visibility: "public" },
    ];

    if (viewerDid) {
        const memberObjectIds = memberCircleIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
        if (memberObjectIds.length > 0) {
            visibleConditions.push({ visibility: "secret", _id: { $in: memberObjectIds } });
        }
    }

    return { $or: visibleConditions };
};

export const getCanonicalMemberCircleIds = async (
    viewerDid?: string,
    dependencies: MemberCircleIdDependencies = canonicalMemberCircleIdDependencies,
): Promise<string[]> => {
    if (!viewerDid) return [];
    const rows = await dependencies.findMemberCircleIds(viewerDid);
    return Array.from(
        new Set(
            rows
                .map((row) => row.circleId)
                .filter((circleId): circleId is string => typeof circleId === "string" && ObjectId.isValid(circleId))
                .map((circleId) => new ObjectId(circleId).toHexString()),
        ),
    );
};

export const getViewerCircleDiscoveryQuery = async (
    viewerDid?: string,
    dependencies?: MemberCircleIdDependencies,
): Promise<Filter<Circle>> => {
    const memberCircleIds = await getCanonicalMemberCircleIds(viewerDid, dependencies);
    return buildViewerCircleDiscoveryQuery(viewerDid, memberCircleIds);
};

export const buildViewerCircleDiscoveryQuery = (
    viewerDid?: string,
    memberCircleIds: readonly string[] = [],
): Filter<Circle> => {
    return {
        $and: [
            circleVisibilityMongoQuery({ viewerDid, memberCircleIds }),
            getDiscoverableLifecycleQuery() as Filter<Circle>,
        ],
    };
};

export const getViewerCircleDiscoveryContext = async (
    viewerDid?: string,
    dependencies?: MemberCircleIdDependencies,
): Promise<{ memberCircleIds: string[]; query: Filter<Circle> }> => {
    const memberCircleIds = await getCanonicalMemberCircleIds(viewerDid, dependencies);
    return { memberCircleIds, query: buildViewerCircleDiscoveryQuery(viewerDid, memberCircleIds) };
};

export const canSetCircleVisibility = async (
    input: CircleVisibilityEntitlementInput,
    dependencies: EntitlementDependencies = superAdminEntitlementDependencies,
): Promise<boolean> => {
    if (input.visibility === undefined) return true;
    const parsedVisibility = circleVisibilitySchema.safeParse(input.visibility);
    if (!parsedVisibility.success) return false;
    const visibility = parsedVisibility.data;
    if (visibility === "public") return true;
    if (input.circleType === "user" || !input.actorDid) return false;
    return dependencies.isSuperAdminDid(input.actorDid);
};

export const assertCanSetCircleVisibility = async (
    input: CircleVisibilityEntitlementInput,
    dependencies?: EntitlementDependencies,
): Promise<void> => {
    if (!(await canSetCircleVisibility(input, dependencies))) {
        throw new Error("Unauthorized: secret circle visibility requires superadmin access.");
    }
};

export const assertGenericCircleUpdateDoesNotChangeVisibility = (
    existingCircle: Partial<Circle>,
    update: Partial<Circle>,
): void => {
    if (!Object.prototype.hasOwnProperty.call(update, "visibility")) return;
    if (getCircleVisibility(update) !== getCircleVisibility(existingCircle)) {
        throw new Error("Circle visibility changes require the dedicated platform authorization path.");
    }
};

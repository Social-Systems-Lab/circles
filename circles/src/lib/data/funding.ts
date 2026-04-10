import { ObjectId } from "mongodb";
import { isVerifiedUser } from "@/lib/auth/verification";
import { SAFE_CIRCLE_PROJECTION } from "@/lib/data/circle";
import { Circles, FundingAsks, Members } from "@/lib/data/db";
import type { Circle, FundingAsk, FundingAskDisplay, FundingAskTrustBadgeType } from "@/models/models";

const FUNDING_LIST_STATUS_ORDER: Record<string, number> = {
    open: 0,
    in_progress: 1,
    completed: 2,
    closed: 3,
    draft: 4,
};

export type FundingCirclePermissions = {
    isEnabled: boolean;
    canView: boolean;
    canCreate: boolean;
    isCircleAdmin: boolean;
    isMember: boolean;
    isVerifiedOwnerOfOwnUserCircle: boolean;
};

type ListFundingAsksOptions = {
    viewerDid?: string;
    includeDrafts?: boolean;
    limit?: number;
};

const normalizeFundingAsk = (ask: FundingAsk | null): FundingAsk | null => {
    if (!ask) {
        return null;
    }

    return {
        ...ask,
        _id: ask._id?.toString?.() ?? ask._id,
    };
};

const sortFundingAsks = <T extends { status: string; updatedAt?: Date; createdAt?: Date }>(asks: T[]) =>
    [...asks].sort((left, right) => {
        const statusDelta = (FUNDING_LIST_STATUS_ORDER[left.status] ?? 99) - (FUNDING_LIST_STATUS_ORDER[right.status] ?? 99);
        if (statusDelta !== 0) {
            return statusDelta;
        }

        const leftTime = left.updatedAt?.getTime() ?? left.createdAt?.getTime() ?? 0;
        const rightTime = right.updatedAt?.getTime() ?? right.createdAt?.getTime() ?? 0;
        return rightTime - leftTime;
    });

export const deriveFundingTrustBadgeType = ({
    isCircleAdmin,
    isVerifiedCreator,
    isProxy,
}: {
    isCircleAdmin: boolean;
    isVerifiedCreator: boolean;
    isProxy: boolean;
}): FundingAskTrustBadgeType => {
    if (isCircleAdmin) {
        return "circle_admin";
    }
    if (isVerifiedCreator) {
        return "verified_member";
    }
    if (isProxy) {
        return "proxy_ask";
    }
    return "member_ask";
};

export const isFundingEnabledForCircle = (circle: Circle): boolean => circle.enabledModules?.includes("funding") ?? false;

export async function getFundingCirclePermissions(
    circle: Circle,
    viewerDid?: string,
): Promise<FundingCirclePermissions> {
    const isEnabled = isFundingEnabledForCircle(circle);

    if (!viewerDid || !circle._id || !isEnabled) {
        return {
            isEnabled,
            canView: false,
            canCreate: false,
            isCircleAdmin: false,
            isMember: false,
            isVerifiedOwnerOfOwnUserCircle: false,
        };
    }

    const [membership, viewerCircle] = await Promise.all([
        Members.findOne({ userDid: viewerDid, circleId: circle._id.toString() }),
        Circles.findOne({ did: viewerDid }, { projection: SAFE_CIRCLE_PROJECTION }),
    ]);

    const isMember = Boolean(membership);
    const isCircleAdmin = membership?.userGroups?.includes("admins") ?? false;
    const isVerifiedOwnerOfOwnUserCircle =
        circle.circleType === "user" && circle.did === viewerDid && isVerifiedUser(viewerCircle);

    return {
        isEnabled,
        canView: isMember,
        canCreate: isCircleAdmin || isVerifiedOwnerOfOwnUserCircle,
        isCircleAdmin,
        isMember,
        isVerifiedOwnerOfOwnUserCircle,
    };
}

const isFundingAskVisibleToViewer = ({
    ask,
    viewerDid,
    isCircleAdmin,
}: {
    ask: FundingAsk;
    viewerDid?: string;
    isCircleAdmin: boolean;
}) => {
    if (ask.status !== "draft") {
        return true;
    }

    if (!viewerDid) {
        return false;
    }

    return ask.createdByDid === viewerDid || isCircleAdmin;
};

const hydrateFundingAskProfiles = async (asks: FundingAsk[], circle?: Circle): Promise<FundingAskDisplay[]> => {
    if (asks.length === 0) {
        return [];
    }

    const dids = Array.from(
        new Set(
            asks
                .flatMap((ask) => [ask.createdByDid, ask.activeSupporterDid].filter((value): value is string => Boolean(value))),
        ),
    );

    const profiles = dids.length
        ? await Circles.find({ did: { $in: dids } }, { projection: SAFE_CIRCLE_PROJECTION }).toArray()
        : [];

    const profilesByDid = new Map(
        profiles.map((profile) => [profile.did, { ...profile, _id: profile._id?.toString?.() ?? profile._id } as Circle]),
    );

    return asks.map((ask) => ({
        ...ask,
        circle,
        creator: ask.createdByDid ? profilesByDid.get(ask.createdByDid) : undefined,
        activeSupporter: ask.activeSupporterDid ? profilesByDid.get(ask.activeSupporterDid) : undefined,
    }));
};

export async function listFundingAsksByCircleId(
    circle: Circle,
    options: ListFundingAsksOptions = {},
): Promise<FundingAskDisplay[]> {
    if (!circle._id || !isFundingEnabledForCircle(circle)) {
        return [];
    }

    const permissions = await getFundingCirclePermissions(circle, options.viewerDid);
    if (!permissions.canView) {
        return [];
    }

    const rawAsks = (await FundingAsks.find({ circleId: circle._id.toString() }).toArray()) as FundingAsk[];
    const normalizedAsks = rawAsks
        .map((ask) => normalizeFundingAsk(ask))
        .filter((ask): ask is FundingAsk => Boolean(ask))
        .filter((ask) =>
            isFundingAskVisibleToViewer({
                ask,
                viewerDid: options.viewerDid,
                isCircleAdmin: permissions.isCircleAdmin,
            }),
        );

    const sorted = sortFundingAsks(normalizedAsks);
    const limited = typeof options.limit === "number" ? sorted.slice(0, options.limit) : sorted;
    return hydrateFundingAskProfiles(limited, circle);
}

export async function getFundingAskById(
    circle: Circle,
    askId: string,
    viewerDid?: string,
): Promise<FundingAskDisplay | null> {
    if (!circle._id || !ObjectId.isValid(askId) || !isFundingEnabledForCircle(circle)) {
        return null;
    }

    const permissions = await getFundingCirclePermissions(circle, viewerDid);
    if (!permissions.canView) {
        return null;
    }

    const rawAsk = (await FundingAsks.findOne({
        _id: new ObjectId(askId),
        circleId: circle._id.toString(),
    })) as FundingAsk | null;

    const ask = normalizeFundingAsk(rawAsk);
    if (!ask) {
        return null;
    }

    if (
        !isFundingAskVisibleToViewer({
            ask,
            viewerDid,
            isCircleAdmin: permissions.isCircleAdmin,
        })
    ) {
        return null;
    }

    const [display] = await hydrateFundingAskProfiles([ask], circle);
    return display ?? null;
}

export async function insertFundingAsk(ask: FundingAsk): Promise<FundingAsk> {
    const result = await FundingAsks.insertOne(ask);
    return {
        ...ask,
        _id: result.insertedId.toString(),
    };
}

export async function updateFundingAskDocument(
    askId: string,
    updates: Partial<FundingAsk>,
): Promise<boolean> {
    if (!ObjectId.isValid(askId)) {
        return false;
    }

    const definedEntries = Object.entries(updates).filter(([, value]) => value !== undefined);
    const undefinedEntries = Object.entries(updates).filter(([, value]) => value === undefined);
    const updateOperation: Record<string, Record<string, unknown>> = {};

    if (definedEntries.length > 0) {
        updateOperation.$set = Object.fromEntries(definedEntries);
    }

    if (undefinedEntries.length > 0) {
        updateOperation.$unset = Object.fromEntries(undefinedEntries.map(([key]) => [key, ""]));
    }

    if (Object.keys(updateOperation).length === 0) {
        return true;
    }

    const result = await FundingAsks.updateOne({ _id: new ObjectId(askId) }, updateOperation);
    return result.matchedCount > 0;
}

export async function getFundingAskDocumentById(askId: string): Promise<FundingAsk | null> {
    if (!ObjectId.isValid(askId)) {
        return null;
    }

    return normalizeFundingAsk((await FundingAsks.findOne({ _id: new ObjectId(askId) })) as FundingAsk | null);
}

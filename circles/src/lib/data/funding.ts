import { ObjectId } from "mongodb";
import { SAFE_CIRCLE_PROJECTION } from "@/lib/data/circle";
import { Circles, FundingAsks, Members } from "@/lib/data/db";
import {
    fundingAskCategorySchema,
    fundingAskCurrencySchema,
    fundingAskItemStatusSchema,
} from "@/models/models";
import type {
    Circle,
    FundingAsk,
    FundingAskDisplay,
    FundingAskItem,
    FundingAskItemStatus,
    FundingAskTrustBadgeType,
} from "@/models/models";

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
    isSuperAdmin: boolean;
    isMember: boolean;
};

type ListFundingAsksOptions = {
    viewerDid?: string;
    includeDrafts?: boolean;
    limit?: number;
};

const getNormalizedRequestStatus = (status?: string): FundingAsk["status"] => {
    if (status === "in_progress") {
        return "open";
    }
    return (status as FundingAsk["status"]) || "draft";
};

const getDefaultItemStatus = (requestStatus: FundingAsk["status"]): FundingAskItemStatus => {
    if (requestStatus === "draft") {
        return "draft";
    }
    if (requestStatus === "completed") {
        return "completed";
    }
    if (requestStatus === "closed") {
        return "closed";
    }
    return "open";
};

const normalizeFundingItem = (rawItem: Record<string, unknown> | undefined, ask: Record<string, unknown>): FundingAskItem => {
    const requestStatus = getNormalizedRequestStatus(typeof ask.status === "string" ? ask.status : undefined);
    const parsedCategory = fundingAskCategorySchema.safeParse(rawItem?.category);
    const parsedLegacyCategory = fundingAskCategorySchema.safeParse(ask.category);
    const parsedCurrency = fundingAskCurrencySchema.safeParse(rawItem?.currency);
    const parsedLegacyCurrency = fundingAskCurrencySchema.safeParse(ask.currency);
    const parsedItemStatus = fundingAskItemStatusSchema.safeParse(rawItem?.status);
    const title =
        (typeof rawItem?.title === "string" && rawItem.title.trim()) ||
        (typeof rawItem?.name === "string" && rawItem.name.trim()) ||
        (typeof ask.title === "string" && ask.title.trim()) ||
        "Funding item";

    return {
        title,
        category: parsedCategory.success ? parsedCategory.data : parsedLegacyCategory.success ? parsedLegacyCategory.data : "other",
        price:
            typeof rawItem?.price === "number"
                ? rawItem.price
                : typeof ask.amount === "number"
                  ? ask.amount
                  : 0,
        currency: parsedCurrency.success ? parsedCurrency.data : parsedLegacyCurrency.success ? parsedLegacyCurrency.data : "ZAR",
        quantity: typeof rawItem?.quantity === "number" ? rawItem.quantity : undefined,
        unitLabel: typeof rawItem?.unitLabel === "string" ? rawItem.unitLabel : undefined,
        note: typeof rawItem?.note === "string" ? rawItem.note : undefined,
        status: parsedItemStatus.success ? parsedItemStatus.data : getDefaultItemStatus(requestStatus),
        name: typeof rawItem?.name === "string" ? rawItem.name : undefined,
    };
};

const normalizeFundingAsk = (ask: FundingAsk | null): FundingAsk | null => {
    if (!ask) {
        return null;
    }

    const rawAsk = ask as FundingAsk & Record<string, unknown>;
    const normalizedStatus = getNormalizedRequestStatus(typeof rawAsk.status === "string" ? rawAsk.status : undefined);
    const rawItems = Array.isArray(rawAsk.items) ? (rawAsk.items as Array<Record<string, unknown>>) : [];
    const normalizedItems = rawItems.length
        ? rawItems.map((item) => normalizeFundingItem(item, rawAsk))
        : [normalizeFundingItem(undefined, rawAsk)];

    return {
        ...rawAsk,
        _id: ask._id?.toString?.() ?? ask._id,
        status: normalizedStatus,
        items: normalizedItems,
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
    isProxy,
}: {
    isProxy: boolean;
}): FundingAskTrustBadgeType => {
    if (isProxy) {
        return "proxy_ask";
    }
    return "circle_admin";
};

export const isFundingEnabledForCircle = (circle: Circle): boolean =>
    circle.circleType === "circle" && (circle.enabledModules?.includes("funding") ?? false);

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
            isSuperAdmin: false,
            isMember: false,
        };
    }

    const [membership, viewerCircle] = await Promise.all([
        Members.findOne({ userDid: viewerDid, circleId: circle._id.toString() }),
        Circles.findOne({ did: viewerDid }, { projection: { isAdmin: 1 } }),
    ]);

    const isMember = Boolean(membership);
    const isSuperAdmin = Boolean(viewerCircle?.isAdmin);

    return {
        isEnabled,
        canView: isMember || isSuperAdmin,
        canCreate: isSuperAdmin,
        isSuperAdmin,
        isMember,
    };
}

const isFundingAskVisibleToViewer = ({
    ask,
    viewerDid,
    isSuperAdmin,
}: {
    ask: FundingAsk;
    viewerDid?: string;
    isSuperAdmin: boolean;
}) => {
    if (ask.status !== "draft") {
        return true;
    }

    if (!viewerDid) {
        return false;
    }

    return ask.createdByDid === viewerDid || isSuperAdmin;
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
                isSuperAdmin: permissions.isSuperAdmin,
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
            isSuperAdmin: permissions.isSuperAdmin,
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

import { db } from "@/lib/data/db";
import {
    DEFAULT_WELCOME_BANNER_TEXT,
    WELCOME_BANNER_KEY,
} from "@/config/platform-banner";
import type { PlatformBannerType } from "@/config/platform-banner";

export type PlatformBannerDoc = {
    _id?: any;
    key: string;
    type: PlatformBannerType;
    text: string;
    ctaLabel?: string;
    ctaUrl?: string;
    isActive: boolean;
    updatedAt: Date;
    updatedBy?: string;
};

export type PlatformBannerDraft = {
    banner: PlatformBannerDoc | null;
    bannerSource: "db" | "fallback";
    type: PlatformBannerType;
    text: string;
    ctaLabel: string;
    ctaUrl: string;
    isActive: boolean;
    updatedAt?: Date;
};

const SystemBanners = db?.collection<PlatformBannerDoc>("systemBanners");
SystemBanners?.createIndex({ key: 1 }, { unique: true });

const normalizeBanner = (banner: PlatformBannerDoc | null): PlatformBannerDoc | null => {
    if (!banner) return null;
    return {
        ...banner,
        _id: banner._id?.toString?.() || banner._id,
    };
};

export const getActiveBanner = async (): Promise<PlatformBannerDoc | null> => {
    const banner = normalizeBanner((await SystemBanners?.findOne({ key: WELCOME_BANNER_KEY, isActive: true })) || null);
    if (!banner?.text?.trim()) {
        return null;
    }

    return banner;
};

export const getWelcomeBannerDraft = async (): Promise<PlatformBannerDraft> => {
    const storedBanner = normalizeBanner((await SystemBanners?.findOne({ key: WELCOME_BANNER_KEY })) || null);

    return {
        banner: storedBanner,
        bannerSource: storedBanner ? "db" : "fallback",
        type: storedBanner?.type || "alert",
        text: storedBanner?.text || DEFAULT_WELCOME_BANNER_TEXT,
        ctaLabel: storedBanner?.ctaLabel || "",
        ctaUrl: storedBanner?.ctaUrl || "",
        isActive: storedBanner?.isActive ?? true,
        updatedAt: storedBanner?.updatedAt,
    };
};

export const saveWelcomeBanner = async (input: {
    type: PlatformBannerType;
    text: string;
    ctaLabel?: string;
    ctaUrl?: string;
    isActive: boolean;
    updatedBy?: string;
}): Promise<PlatformBannerDoc> => {
    if (!SystemBanners) {
        throw new Error("System banners collection is not available");
    }

    const now = new Date();
    const nextBanner: PlatformBannerDoc = {
        key: WELCOME_BANNER_KEY,
        type: input.type,
        text: input.text,
        ctaLabel: input.ctaLabel || "",
        ctaUrl: input.ctaUrl || "",
        isActive: input.isActive,
        updatedAt: now,
        updatedBy: input.updatedBy,
    };

    await SystemBanners.updateOne(
        { key: WELCOME_BANNER_KEY },
        {
            $set: nextBanner,
        },
        { upsert: true },
    );

    const savedBanner = normalizeBanner((await SystemBanners.findOne({ key: WELCOME_BANNER_KEY })) || null);
    if (!savedBanner) {
        throw new Error("Failed to save welcome banner");
    }

    return savedBanner;
};

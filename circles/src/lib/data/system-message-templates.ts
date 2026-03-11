import { db } from "@/lib/data/db";
import { Circle } from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getKamooniSystemSender } from "@/config/system-sender";
import { WELCOME_MESSAGE, WelcomeMessageConfig } from "@/config/welcome-message";

export const WELCOME_SYSTEM_TEMPLATE_KEY = "welcome" as const;

export type SystemMessageTemplateDoc = {
    _id?: any;
    key: string;
    title: string;
    bodyMarkdown: string;
    senderCircleHandle: string;
    repliesDisabled: boolean;
    isActive: boolean;
    version: string;
    updatedAt: Date;
    updatedBy?: string;
};

type ResolvedSender = {
    senderDid: string;
    senderHandle: string;
    senderName: string;
    senderAvatarUrl: string;
    senderCircle: Circle | null;
};

export type ResolvedWelcomeTemplate = {
    config: WelcomeMessageConfig;
    senderDid: string;
    templateSource: "db" | "fallback";
    template: SystemMessageTemplateDoc | null;
    senderCircle: Circle | null;
};

export type WelcomeTemplateDraft = {
    template: SystemMessageTemplateDoc | null;
    templateSource: "db" | "fallback";
    title: string;
    bodyMarkdown: string;
    repliesDisabled: boolean;
    senderCircleHandle: string;
    isActive: boolean;
    version: string;
    updatedAt?: Date;
    senderCircle: Circle | null;
    senderDid: string;
};

const SystemMessageTemplates = db?.collection<SystemMessageTemplateDoc>("systemMessageTemplates");
SystemMessageTemplates?.createIndex({ key: 1 }, { unique: true });

const normalizeTemplate = (template: SystemMessageTemplateDoc | null): SystemMessageTemplateDoc | null => {
    if (!template) return null;
    return {
        ...template,
        _id: template._id?.toString?.() || template._id,
    };
};

const bumpTemplateVersion = (currentVersion: string): string => {
    const match = currentVersion.trim().match(/^v(\d+)$/i);
    if (!match) return currentVersion;
    return `v${Number(match[1]) + 1}`;
};

const resolveSender = async (): Promise<ResolvedSender> => {
    const canonicalSender = getKamooniSystemSender();
    const senderCircle = await getCircleByHandle(canonicalSender.handle);
    return {
        senderDid: canonicalSender.did,
        senderHandle: canonicalSender.handle,
        senderName: canonicalSender.displayName,
        senderAvatarUrl: canonicalSender.avatarUrl,
        senderCircle: senderCircle || null,
    };
};

const buildWelcomeConfig = (
    template: SystemMessageTemplateDoc | null,
    sender: ResolvedSender,
    fallbackVersion: string = WELCOME_MESSAGE.version,
): WelcomeMessageConfig => ({
    senderHandle: sender.senderHandle,
    displayName: sender.senderName,
    avatarUrl: sender.senderAvatarUrl,
    threadName: template?.title || WELCOME_MESSAGE.threadName,
    source: WELCOME_MESSAGE.source,
    version: template?.version || fallbackVersion,
    repliesDisabled: template?.repliesDisabled ?? WELCOME_MESSAGE.repliesDisabled,
    markdown: template?.bodyMarkdown || WELCOME_MESSAGE.markdown,
});

export const getResolvedWelcomeTemplate = async (): Promise<ResolvedWelcomeTemplate> => {
    const activeTemplate = normalizeTemplate(
        (await SystemMessageTemplates?.findOne({
            key: WELCOME_SYSTEM_TEMPLATE_KEY,
            isActive: true,
        })) || null,
    );
    const sender = await resolveSender();

    return {
        config: buildWelcomeConfig(activeTemplate, sender),
        senderDid: sender.senderDid,
        templateSource: activeTemplate ? "db" : "fallback",
        template: activeTemplate,
        senderCircle: sender.senderCircle,
    };
};

export const getWelcomeTemplateDraft = async (): Promise<WelcomeTemplateDraft> => {
    const storedTemplate = normalizeTemplate(
        (await SystemMessageTemplates?.findOne({ key: WELCOME_SYSTEM_TEMPLATE_KEY })) || null,
    );
    const sender = await resolveSender();

    return {
        template: storedTemplate,
        templateSource: storedTemplate ? "db" : "fallback",
        title: storedTemplate?.title || WELCOME_MESSAGE.threadName,
        bodyMarkdown: storedTemplate?.bodyMarkdown || WELCOME_MESSAGE.markdown,
        repliesDisabled: storedTemplate?.repliesDisabled ?? WELCOME_MESSAGE.repliesDisabled,
        senderCircleHandle: sender.senderHandle,
        isActive: storedTemplate?.isActive ?? true,
        version: storedTemplate?.version || WELCOME_MESSAGE.version,
        updatedAt: storedTemplate?.updatedAt,
        senderCircle: sender.senderCircle,
        senderDid: sender.senderDid,
    };
};

export const saveWelcomeTemplate = async (input: {
    title: string;
    bodyMarkdown: string;
    repliesDisabled: boolean;
    updatedBy?: string;
    isActive?: boolean;
}): Promise<SystemMessageTemplateDoc> => {
    if (!SystemMessageTemplates) {
        throw new Error("System message templates collection is not available");
    }

    const existingTemplate = normalizeTemplate(
        (await SystemMessageTemplates.findOne({ key: WELCOME_SYSTEM_TEMPLATE_KEY })) || null,
    );

    const now = new Date();
    const nextVersion = existingTemplate
        ? bumpTemplateVersion(existingTemplate.version || WELCOME_MESSAGE.version)
        : WELCOME_MESSAGE.version;

    const nextTemplate: SystemMessageTemplateDoc = {
        key: WELCOME_SYSTEM_TEMPLATE_KEY,
        title: input.title,
        bodyMarkdown: input.bodyMarkdown,
        senderCircleHandle: getKamooniSystemSender().handle,
        repliesDisabled: input.repliesDisabled,
        isActive: input.isActive ?? existingTemplate?.isActive ?? true,
        version: nextVersion,
        updatedAt: now,
        updatedBy: input.updatedBy || existingTemplate?.updatedBy,
    };

    await SystemMessageTemplates.updateOne(
        { key: WELCOME_SYSTEM_TEMPLATE_KEY },
        {
            $set: nextTemplate,
        },
        { upsert: true },
    );

    const savedTemplate = normalizeTemplate(
        (await SystemMessageTemplates.findOne({ key: WELCOME_SYSTEM_TEMPLATE_KEY })) || null,
    );
    if (!savedTemplate) {
        throw new Error("Failed to save welcome template");
    }

    return savedTemplate;
};
